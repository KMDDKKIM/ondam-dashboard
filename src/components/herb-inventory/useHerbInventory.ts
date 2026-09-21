'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { confirmDialog } from '@/lib/confirmDialog';
import { createClient } from '@/lib/supabase/client';
import {
  listHerbInventory,
  deleteHerbInventoryItem,
  applyHerbStockChanges,
  setHerbLowStockThreshold,
  listRecentHerbInventoryLogs,
  listStaffNames,
  stockErrorMessage,
} from '@/lib/supabase/herbInventory';
import { bagCount, sortHerbsKo } from '@/lib/herbList';
import type { HerbInventoryItem, HerbInventoryLog } from '@/lib/types';

export interface HerbMessages {
  error: string;
  notice: string;
  warning: string;
}

// 재고 목록과 사용/입고/기준/삭제 동작을 한곳에서 관리한다.
// - 목록은 언제나 가나다순으로 들고 있다(불러올 때마다 sortHerbsKo).
// - 봉지 수 변경은 화면에 먼저 반영(낙관적)하고, 같은 약재의 요청은 순서대로 하나씩 보낸다.
//   실패하면 그 변경만 되돌리고, 모든 요청이 끝나면 서버 값으로 맞춘다.
export function useHerbInventory() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<HerbInventoryItem[]>([]);
  const itemsRef = useRef<HerbInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<HerbMessages>({ error: '', notice: '', warning: '' });
  const [logs, setLogs] = useState<HerbInventoryLog[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});

  const queues = useRef(new Map<string, Promise<void>>());
  const pendingByHerb = useRef(new Map<string, number>());
  const pendingTotal = useRef(0);

  const commit = useCallback((updater: (prev: HerbInventoryItem[]) => HerbInventoryItem[]) => {
    itemsRef.current = updater(itemsRef.current);
    setItems(itemsRef.current);
  }, []);

  const patchMessages = useCallback((patch: Partial<HerbMessages>) => {
    setMessages((m) => ({ ...m, ...patch }));
  }, []);

  // 이력은 부가 정보라 실패해도 재고 화면은 그대로 보여준다.
  const loadHistory = useCallback(async () => {
    try {
      const [l, names] = await Promise.all([listRecentHerbInventoryLogs(supabase, 50), listStaffNames(supabase)]);
      setLogs(l);
      setStaffNames(names);
    } catch {
      // 이력 표시만 비어 있게 둔다.
    }
  }, [supabase]);

  // 처음 한 번만 "불러오는 중"을 보여준다(다시 불러올 때 화면을 비우면 입력 중인 내용이 사라진다).
  const load = useCallback(async () => {
    try {
      const fresh = sortHerbsKo(await listHerbInventory(supabase));
      // 아직 서버에 보내는 중인 약재는 화면의 (낙관적) 봉지 수를 지킨다 — 서버 값은 아직 옛것이다(끝나면 다시 맞춘다).
      commit((prev) => {
        if (pendingByHerb.current.size === 0) return fresh;
        const local = new Map(prev.map((i) => [i.id, i]));
        return fresh.map((f) => (pendingByHerb.current.has(f.id) && local.has(f.id) ? { ...f, currentStock: local.get(f.id)!.currentStock } : f));
      });
    } catch {
      patchMessages({ error: '불러오기에 실패했습니다.' });
    } finally {
      setLoading(false);
    }
    await loadHistory();
  }, [supabase, commit, patchMessages, loadHistory]);

  useEffect(() => {
    load();
  }, [load]);

  // 한 약재의 봉지 수를 바꾼다. 사용은 현재 봉지 수를 넘길 수 없어 음수가 되지 않는다.
  const adjust = useCallback(
    (id: string, type: 'use' | 'restock', amount: number, note: string | null = null) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item || !Number.isInteger(amount) || amount < 1) return;
      const before = bagCount(item.currentStock);
      if (type === 'use' && before < amount) {
        patchMessages({ error: `${item.name}은(는) ${before}봉지뿐이라 ${amount}봉지를 뺄 수 없어요.`, notice: '' });
        return;
      }
      const delta = type === 'use' ? -amount : amount;
      commit((prev) => prev.map((i) => (i.id === id ? { ...i, currentStock: bagCount(i.currentStock) + delta } : i)));
      patchMessages({ error: '', notice: '' });

      pendingByHerb.current.set(id, (pendingByHerb.current.get(id) ?? 0) + 1);
      pendingTotal.current += 1;

      const finish = (serverStock: number | null) => {
        const left = (pendingByHerb.current.get(id) ?? 1) - 1;
        if (left <= 0) pendingByHerb.current.delete(id);
        else pendingByHerb.current.set(id, left);
        pendingTotal.current -= 1;
        if (left <= 0 && serverStock != null) {
          commit((prev) => prev.map((i) => (i.id === id ? { ...i, currentStock: bagCount(serverStock) } : i)));
        }
        if (pendingTotal.current === 0) {
          // 실패가 섞였다면(serverStock == null) 서버 기준으로 다시 맞추고, 이력도 새로 읽는다.
          if (serverStock == null) load();
          else loadHistory();
        }
      };

      const previous = queues.current.get(id) ?? Promise.resolve();
      const next = previous.then(async () => {
        try {
          const res = await applyHerbStockChanges(supabase, [
            { herbId: id, name: item.name, changeType: type, amount, note },
          ]);
          finish(res[0]?.currentStock ?? null);
        } catch (e) {
          commit((prev) => prev.map((i) => (i.id === id ? { ...i, currentStock: bagCount(i.currentStock - delta) } : i)));
          patchMessages({ error: `${item.name}: ${stockErrorMessage(e)}` });
          finish(null);
        }
      });
      queues.current.set(id, next);
    },
    [supabase, commit, patchMessages, load, loadHistory]
  );

  // 실패하면 오류를 던져서 입력창이 메시지를 보여준다.
  const saveThreshold = useCallback(
    async (id: string, threshold: number | null) => {
      await setHerbLowStockThreshold(supabase, id, threshold);
      commit((prev) =>
        prev.map((i) => (i.id === id ? { ...i, lowStockThreshold: threshold, updatedAt: new Date().toISOString() } : i))
      );
    },
    [supabase, commit]
  );

  const deleteHerb = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
      if (!(await confirmDialog(`"${item.name}"을(를) 삭제할까요? 사용·입고 기록도 함께 지워져요.`))) return;
      patchMessages({ error: '', notice: '', warning: '' });
      try {
        await deleteHerbInventoryItem(supabase, id);
        commit((prev) => prev.filter((i) => i.id !== id));
        patchMessages({ notice: `${item.name}을(를) 삭제했어요.` });
        loadHistory();
      } catch {
        patchMessages({ error: '삭제하지 못했습니다. (삭제 권한 설정이 아직 안 됐을 수 있어요)' });
      }
    },
    [supabase, commit, patchMessages, loadHistory]
  );

  return {
    supabase,
    items,
    itemsRef,
    loading,
    messages,
    patchMessages,
    logs,
    staffNames,
    load,
    adjust,
    saveThreshold,
    deleteHerb,
  };
}
