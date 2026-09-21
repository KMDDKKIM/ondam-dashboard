import Link from 'next/link';
import { formatMonthDay } from '@/lib/closingChecks';

export interface TodayStatusProps {
  /** 어제 마감이 없으면 [어제 날짜], 있으면 [] . null 이면 조회 실패. */
  missingClosing: string[] | null;
  /** 재고가 0 이하인 약재 수. null 이면 조회 실패. */
  zeroStockCount: number | null;
  /** 물품신청 주문 대기 / 도착 대기 건수. null 이면 조회 실패. */
  supply: { waitingOrder: number; waitingArrival: number } | null;
  /** 처리 대기 중인 비대면진료 신청 수. null 이면 조회 실패. */
  remoteNew: number | null;
}

interface Row {
  key: string;
  icon: string;
  text: string;
  state: 'todo' | 'ok' | 'unknown';
  badge: string;
  href: string;
}

// 홈 맨 위 "오늘 해야 할 일" — 직원이 놓치기 쉬운 것(어제 결산, 재고 0, 물품 대기)만 한눈에.
// 해야 할 것은 빨간 배지, 끝난 것은 초록 체크, 조회에 실패한 것은 회색 "확인 불가"로 보여 준다.
export function TodayStatus({ missingClosing, zeroStockCount, supply, remoteNew }: TodayStatusProps) {
  const rows: Row[] = [];

  if (missingClosing == null) {
    rows.push({ key: 'closing', icon: '📥', text: '어제 결산', state: 'unknown', badge: '확인 불가', href: '/paste-import' });
  } else if (missingClosing.length > 0) {
    rows.push({
      key: 'closing',
      icon: '📥',
      text: `어제(${formatMonthDay(missingClosing[0])}) 결산이 아직 입력되지 않았어요`,
      state: 'todo',
      badge: '입력하기',
      href: '/paste-import',
    });
  } else {
    rows.push({ key: 'closing', icon: '📥', text: '어제 결산 입력 완료', state: 'ok', badge: '완료', href: '/paste-import' });
  }

  if (zeroStockCount == null) {
    rows.push({ key: 'stock', icon: '🌿', text: '한약재 재고', state: 'unknown', badge: '확인 불가', href: '/herb-inventory' });
  } else if (zeroStockCount > 0) {
    rows.push({ key: 'stock', icon: '🌿', text: `재고가 0인 약재 ${zeroStockCount}개`, state: 'todo', badge: '확인하기', href: '/herb-inventory' });
  } else {
    rows.push({ key: 'stock', icon: '🌿', text: '재고가 0인 약재 없음', state: 'ok', badge: '정상', href: '/herb-inventory' });
  }

  if (supply == null) {
    rows.push({ key: 'supply', icon: '📦', text: '물품신청', state: 'unknown', badge: '확인 불가', href: '/supply-requests' });
  } else if (supply.waitingOrder + supply.waitingArrival > 0) {
    const parts: string[] = [];
    if (supply.waitingOrder > 0) parts.push(`주문 대기 ${supply.waitingOrder}건`);
    if (supply.waitingArrival > 0) parts.push(`도착 대기 ${supply.waitingArrival}건`);
    rows.push({ key: 'supply', icon: '📦', text: `물품신청 ${parts.join(' · ')}`, state: 'todo', badge: '보기', href: '/supply-requests' });
  } else {
    rows.push({ key: 'supply', icon: '📦', text: '처리할 물품신청 없음', state: 'ok', badge: '정상', href: '/supply-requests' });
  }

  if (remoteNew == null) {
    rows.push({ key: 'remote', icon: '📨', text: '비대면진료 신청', state: 'unknown', badge: '확인 불가', href: '/remote-consult-alerts' });
  } else if (remoteNew > 0) {
    rows.push({ key: 'remote', icon: '📨', text: `비대면진료 신청 ${remoteNew}건이 처리를 기다려요`, state: 'todo', badge: '처리하기', href: '/remote-consult-alerts' });
  } else {
    rows.push({ key: 'remote', icon: '📨', text: '처리할 비대면진료 신청 없음', state: 'ok', badge: '정상', href: '/remote-consult-alerts' });
  }

  const todoCount = rows.filter((r) => r.state === 'todo').length;

  return (
    <div className="card" style={{ padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 700 }}>
        <span>✅</span>
        <span>오늘 확인할 것</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: '1px 9px',
            borderRadius: 10,
            background: todoCount > 0 ? 'var(--color-error)' : 'var(--color-green)',
            color: '#fff',
          }}
        >
          {todoCount > 0 ? `${todoCount}건` : '모두 확인함'}
        </span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map((row) => (
          <li key={row.key} style={{ borderTop: '1px solid var(--color-line)' }}>
            <Link href={row.href} className="status-row">
              <span style={{ fontSize: 16 }}>{row.icon}</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: row.state === 'todo' ? 700 : 500, color: row.state === 'ok' ? 'var(--color-muted)' : undefined }}>
                {row.text}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '2px 10px',
                  borderRadius: 10,
                  background:
                    row.state === 'todo' ? 'rgba(209, 69, 59, 0.12)' : row.state === 'ok' ? 'rgba(79, 174, 106, 0.14)' : 'var(--color-surface-2)',
                  color: row.state === 'todo' ? 'var(--color-error)' : row.state === 'ok' ? 'var(--color-green)' : 'var(--color-muted)',
                }}
              >
                {row.state === 'ok' ? `✓ ${row.badge}` : row.badge}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
