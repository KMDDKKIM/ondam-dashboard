import Link from 'next/link';
import { missingClosingMessage } from '@/lib/closingChecks';

// "어제(9/19) 마감이 아직 입력되지 않았어요" — 어제 마감이 없을 때만 나온다.
// 예약관리 화면과 홈 화면이 함께 쓴다(dates 는 fetchMissingClosingDates 의 결과).
export function MissingClosingBanner({ dates }: { dates: string[] }) {
  const message = missingClosingMessage(dates);
  if (!message) return null;
  return (
    <div
      className="no-print"
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        padding: '8px 12px',
        marginBottom: 10,
        borderRadius: 8,
        border: '1px solid var(--color-orange)',
        background: 'var(--color-surface-2)',
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--color-orange)',
      }}
    >
      <span>⚠ {message}</span>
      <Link href="/paste-import" style={{ fontWeight: 700, textDecoration: 'underline', color: 'inherit' }}>
        일일결산 입력하러 가기
      </Link>
    </div>
  );
}
