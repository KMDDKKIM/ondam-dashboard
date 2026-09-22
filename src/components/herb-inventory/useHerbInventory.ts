'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { confirmDialog } from '@/lib/confirmDialog';
import { createClient } from '@/lib/supabase/client';
import {
  listHerbInventory,
  deleteHerbInventoryItem,
  setHerbLowStockThreshold,
  renameHerbInventoryItem,
  listRecentHerbInventoryLogs,
  listStaffNames,
} from '@/lib/supabase/herbInventory';
import { sortHerbsKo } from '@/lib/herbList';
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
      commit(() => fresh);
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

  // 이름은 언제든 고칠 수 있다. 바뀌면 가나다 자리도 다시 맞춘다.
  const renameHerb = useCallback(
    async (id: string, name: string) => {
      await renameHerbInventoryItem(supabase, id, name);
      commit((prev) => sortHerbsKo(prev.map((i) => (i.id === id ? { ...i, name, updatedAt: new Date().toISOString() } : i))));
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
    saveThreshold,
    renameHerb,
    deleteHerb,
  };
}
