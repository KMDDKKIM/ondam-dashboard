'use client';

import { MonthStats } from '@/components/non-covered/MonthStats';
import { useNonCoveredData } from '@/components/non-covered/useNonCoveredData';
import { todayKst } from '@/lib/kst';

// 월별 현황: 달을 고르면 그 달에 어떤 비급여가 몇 건, 얼마 나왔는지(상품별, 구분별)를 보여 준다.
export default function NonCoveredMonthlyPage() {
  const { purchases, loading, error } = useNonCoveredData();
  if (loading) return <p className="muted-text">불러오는 중...</p>;

  return (
    <div>
      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}
      <MonthStats purchases={purchases} currentMonth={todayKst().slice(0, 7)} />
    </div>
  );
}
