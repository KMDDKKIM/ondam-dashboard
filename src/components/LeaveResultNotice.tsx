'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { listLeaveRequests, type LeaveRequest } from '@/lib/supabase/leave';
import { noticeKey, unseenNotices } from '@/lib/leaveNotice';

const SEEN_KEY = 'leave.seenResults';
const CHECK_INTERVAL_MS = 60000;
const CONFETTI_COLORS = ['#f59e0b', '#2c8fd6', '#4fae6a', '#e2557b', '#7c6ac8', '#14b8a6'];

function readSeen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    // 오래된 id가 끝없이 쌓이지 않게 최근 200개만 남긴다.
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen).slice(-200)));
  } catch {
    // 저장이 막힌 브라우저에서는 팝업이 다음 접속 때 한 번 더 뜰 뿐이다.
  }
}

function describe(r: LeaveRequest): string {
  const [, sm, sd] = r.startDate.split('-').map(Number);
  const [, em, ed] = r.endDate.split('-').map(Number);
  const range = r.startDate === r.endDate ? `${sm}월 ${sd}일` : `${sm}월 ${sd}일 ~ ${em}월 ${ed}일`;
  const half = r.halfDay ? (r.halfDay === 'am' ? ' 오전 반차' : ' 오후 반차') : '';
  return `${range}${half}`;
}

// 내가 낸 연차 신청이 원장 승인으로 확정되면 축하 애니메이션과 함께, 반려되면 안내로 한 번 알려 준다
// (원장 요청, 2026-10-02). 어느 화면에 있든 보이도록 앱 공통 레이아웃에 둔다.
export function LeaveResultNotice() {
  const supabase = useMemo(() => createClient(), []);
  const [queue, setQueue] = useState<LeaveRequest[]>([]);

  const check = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const mine = await listLeaveRequests(supabase, { staffId: user.id });
      setQueue(unseenNotices(mine, user.id, readSeen()));
    } catch {
      // 알림이 안 떠도 연차 화면에서 결과는 그대로 확인할 수 있다.
    }
  }, [supabase]);

  useEffect(() => {
    check();
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [check]);

  const current = queue[0];
  if (!current) return null;

  const approved = current.status === 'approved';
  const kind = current.kind === 'monthly' ? '월차' : '연차';

  function close() {
    const seen = readSeen();
    seen.add(noticeKey(current));
    saveSeen(seen);
    setQueue((prev) => prev.slice(1));
  }

  return (
    <div className="leave-notice-overlay" role="dialog" aria-modal="true" aria-label={approved ? `${kind} 확정` : `${kind} 반려`}>
      {approved && (
        <div className="confetti-layer" aria-hidden="true">
          {Array.from({ length: 44 }, (_, i) => (
            <span
              key={i}
              className="confetti-piece"
              style={{
                left: `${(i * 23) % 100}%`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${(i % 11) * 0.12}s`,
                animationDuration: `${2.4 + (i % 5) * 0.4}s`,
                transform: `rotate(${(i * 37) % 360}deg)`,
              }}
            />
          ))}
        </div>
      )}
      <div className="leave-notice-card">
        <div className="leave-notice-emoji">{approved ? '🎉' : '📝'}</div>
        <h2 style={{ fontSize: 20, margin: '0 0 6px' }}>
          {approved ? `${kind} 확정이 완료됐어요!` : `${kind} 신청이 반려됐어요`}
        </h2>
        <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{describe(current)}</p>
        {!approved && current.decisionNote && (
          <p style={{ margin: '4px 0 6px', padding: '8px 12px', borderRadius: 8, background: 'var(--color-surface-2)', fontSize: 13, textAlign: 'left' }}>
            <span className="muted-text">반려 사유 </span>
            {current.decisionNote}
          </p>
        )}
        <p className="muted-text" style={{ margin: '0 0 18px', fontSize: 13 }}>
          {approved ? '푹 쉬고 오세요 😊' : '궁금한 점은 원장님께 여쭤봐 주세요.'}
        </p>
        <button type="button" className="btn-primary" onClick={close} style={{ padding: '8px 28px' }}>
          {queue.length > 1 ? `확인 (${queue.length - 1}건 더 있어요)` : '확인'}
        </button>
      </div>
    </div>
  );
}
