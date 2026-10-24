import { LeandietReportView } from '@/components/diet/LeandietReportView';

// 린다이어트 기록 체크 — 모든 직원이 본다. 아침 리포트는 원장님 PC의 예약 작업이 보내 온다(/api/leandiet/report).
export default function LeandietReportPage() {
  return <LeandietReportView />;
}
