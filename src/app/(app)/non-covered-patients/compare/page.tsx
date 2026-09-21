'use client';

import { useMemo, useState } from 'react';
import { EventComparison } from '@/components/non-covered/EventComparison';
import { MonthlyTrend } from '@/components/non-covered/MonthlyTrend';
import { RevenueCharts } from '@/components/non-covered/RevenueCharts';
import { useNonCoveredData } from '@/components/non-covered/useNonCoveredData';
import { todayKst } from '@/lib/kst';
import { orderCategories } from '@/lib/nonCoveredStats';

const GENERAL = '일반';

// 월별 비교: 월별 매출 막대 그래프, 달끼리 상품별 비교, 최근 6개월 추이, 이벤트 실적 비교.
export default function NonCoveredComparePage() {
  const { purchases, loading, error } = useNonCoveredData();
  const currentMonth = todayKst().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const categories = useMemo(() => {
    const ordered = orderCategories(purchases);
    return ordered.includes(GENERAL) ? ordered : [GENERAL, ...ordered];
  }, [purchases]);
  const eventCategories = useMemo(() => categories.filter((c) => c !== GENERAL), [categories]);

  if (loading) return <p className="muted-text">불러오는 중...</p>;

  return (
    <div>
      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}
      {purchases.length === 0 ? (
        <p className="muted-text">아직 비급여 기록이 없어요. 「구매 기록」에서 구매를 등록하면 여기에 그래프가 나타나요.</p>
      ) : (
        <>
          <RevenueCharts purchases={purchases} currentMonth={currentMonth} selectedMonth={selectedMonth} onSelectMonth={setSelectedMonth} />
          <MonthlyTrend purchases={purchases} currentMonth={currentMonth} />
          {eventCategories.length > 0 && <EventComparison purchases={purchases} categories={categories} eventCategories={eventCategories} />}
        </>
      )}
    </div>
  );
}
