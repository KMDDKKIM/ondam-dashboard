'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { listNonCoveredPurchases } from '@/lib/supabase/nonCoveredPurchases';
import { listNonCoveredProducts } from '@/lib/supabase/nonCoveredProducts';
import { listStaffNames } from '@/lib/supabase/happyCallWorklist';
import type { NonCoveredProduct, NonCoveredPurchase } from '@/lib/types';

// 비급여 현황의 세 화면(구매 기록 / 월별 현황 / 월별 비교)이 같은 방식으로 데이터를 읽도록 묶은 훅.
export function useNonCoveredData() {
  const supabase = useMemo(() => createClient(), []);
  const [purchases, setPurchases] = useState<NonCoveredPurchase[]>([]);
  const [products, setProducts] = useState<NonCoveredProduct[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 처음에만 "불러오는 중"을 보여 준다 — 저장 뒤 다시 읽을 때 화면 상태(월 선택 등)가 초기화되지 않게.
  // (오류 메시지는 지우지 않는다: 저장 실패 안내 뒤에 다시 읽어도 안내가 남아 있어야 한다.)
  const load = useCallback(async () => {
    try {
      const [rows, productRows, names] = await Promise.all([
        listNonCoveredPurchases(supabase),
        listNonCoveredProducts(supabase).catch(() => [] as NonCoveredProduct[]),
        // 등록자 이름은 부가 정보라 실패해도 목록은 보여 준다.
        listStaffNames(supabase).catch(() => ({}) as Record<string, string>),
      ]);
      setPurchases(rows);
      setProducts(productRows);
      setStaffNames(names);
    } catch {
      setError('불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  return { supabase, purchases, products, setProducts, staffNames, loading, error, setError, load };
}
