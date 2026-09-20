'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  CallConflictError,
  listStaffNames,
  loadWorklist,
  postponeCallToTomorrow,
  recordCallResult,
  undoCallResult,
} from '@/lib/supabase/happyCallWorklist';
import { todayKst } from '@/lib/kst';
import type { CallAction, Worklist, WorklistItem } from '@/lib/happyCallQueue';

// 해피콜 목록 페이지와 홈 위젯이 같은 방식으로 읽고/처리하도록 묶은 훅.
// worklist 가 null 이면 아직 못 읽은 상태다: 로딩 중이거나 읽기에 실패한 것이므로
// 화면은 "대상 없음"이 아니라 로딩/오류를 보여야 한다.
export function useHappyCallWorklist() {
  const supabase = useMemo(() => createClient(), []);
  const [today, setToday] = useState(() => todayKst());
  const [worklist, setWorklist] = useState<Worklist | null>(null);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    const nextToday = todayKst();
    setLoading(true);
    try {
      const [list, names] = await Promise.all([loadWorklist(supabase, nextToday), listStaffNames(supabase)]);
      if (id !== requestId.current) return;
      setToday(nextToday);
      setWorklist(list);
      setStaffNames(names);
      setError('');
    } catch {
      if (id !== requestId.current) return;
      setWorklist(null);
      setError('해피콜 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    reload();
    // 화면을 켜 둔 채 자정을 넘기거나 다른 탭에 다녀오면 최신 상태로 다시 읽는다.
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  async function run(item: WorklistItem, task: () => Promise<void>) {
    setBusyKey(item.key);
    try {
      await task();
      await reload();
    } catch (e) {
      if (e instanceof CallConflictError) {
        await reload();
        setError('다른 직원이 이미 이 콜을 처리했어요. 목록을 새로 불러왔어요.');
      } else {
        setError('처리에 실패했습니다. 다시 시도해 주세요.');
      }
    } finally {
      setBusyKey(null);
    }
  }

  const record = (item: WorklistItem, action: CallAction, memo: string) =>
    run(item, async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await recordCallResult(supabase, item, action, { memo, staffId: user?.id ?? null, today: todayKst() });
    });

  const postpone = (item: WorklistItem) => run(item, () => postponeCallToTomorrow(supabase, item, todayKst()));

  const undo = (item: WorklistItem) => run(item, () => undoCallResult(supabase, item, todayKst()));

  return { supabase, today, worklist, staffNames, loading, error, setError, busyKey, reload, record, postpone, undo };
}
