'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { listNonCoveredPurchases } from '@/lib/supabase/nonCoveredPurchases';
import { listNonCoveredProducts } from '@/lib/supabase/nonCoveredProducts';
import { listStaffNames } from '@/lib/supabase/happyCallWorklist';
import { listDoctors } from '@/lib/supabase/doctors';
import { loadRules } from '@/lib/supabase/happyCallRules';
import { DEFAULT_RULES, type HappyCallRules } from '@/lib/happyCallRules';
import type { NonCoveredProduct, NonCoveredPurchase } from '@/lib/types';

// 비급여 현황의 세 화면(구매 기록 / 월별 현황 / 월별 비교)이 같은 방식으로 데이터를 읽도록 묶은 훅.
export function useNonCoveredData() {
  const supabase = useMemo(() => createClient(), []);
  const [purchases, setPurchases] = useState<NonCoveredPurchase[]>([]);
  const [products, setProducts] = useState<NonCoveredProduct[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  // 활성 진료의(대표원장·부원장) 이름 — doctors 테이블에서 자동으로 맞춰진다(감사 결과 #5).
  const [doctorNames, setDoctorNames] = useState<string[]>([]);
  // 해피콜 규칙 — 구매 목록의 해피콜 날짜 안내·엑셀에 쓴다(못 읽으면 기본 규칙).
  const [rules, setRules] = useState<HappyCallRules>(DEFAULT_RULES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 처음에만 "불러오는 중"을 보여 준다 — 저장 뒤 다시 읽을 때 화면 상태(월 선택 등)가 초기화되지 않게.
  // (오류 메시지는 지우지 않는다: 저장 실패 안내 뒤에 다시 읽어도 안내가 남아 있어야 한다.)
  const load = useCallback(async () => {
    try {
      const [rows, productRows, names, doctors, loadedRules] = await Promise.all([
        listNonCoveredPurchases(supabase),
        listNonCoveredProducts(supabase).catch(() => [] as NonCoveredProduct[]),
        // 등록자 이름은 부가 정보라 실패해도 목록은 보여 준다.
        listStaffNames(supabase).catch(() => ({}) as Record<string, string>),
        listDoctors(supabase)
          .then((d) => d.filter((x) => x.active).map((x) => x.name))
          .catch(() => [] as string[]),
        loadRules(supabase),
      ]);
      setPurchases(rows);
      setProducts(productRows);
      setStaffNames(names);
      setDoctorNames(doctors);
      setRules(loadedRules);
    } catch {
      setError('불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  return { supabase, purchases, products, setProducts, staffNames, doctorNames, rules, loading, error, setError, load };
}
