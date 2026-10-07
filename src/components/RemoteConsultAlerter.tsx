'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  countNewRemoteRequests,
  fetchRemoteAlertItem,
  latestRemoteCreatedAt,
  listNewRemoteAlertItemsSince,
  subscribeToNewRemoteRequests,
} from '@/lib/supabase/remoteConsult';
import {
  EMPTY_ALERT_STATE,
  REMOTE_NEW_EVENT,
  REMOTE_POLL_INTERVAL_MS,
  REMOTE_SAFETY_POLL_INTERVAL_MS,
  alertHeadline,
  alertSourceLabel,
  browserNotificationText,
  countIncreased,
  dismissAlert,
  laterIso,
  pushAlerts,
  type AlertState,
  type RemoteAlertItem,
} from '@/lib/remoteAlert';
import { playChime, unlockChimeOnFirstInteraction } from '@/lib/chime';
import { formatSavedAt } from '@/lib/savedAt';
import { RemoteNotifyButton } from '@/components/RemoteNotifyButton';

const REALTIME_DOWN = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

// 비대면진료 새 신청(구글폼·웹페이지)을 어느 메뉴 화면에 있든 바로 알려 준다(원장 요청 — 문자·카톡 없이 대시보드 안에서만).
// Supabase Realtime 으로 INSERT 를 받아 오른쪽 아래에 팝업을 쌓고(닫거나 누를 때까지 남는다), "딩-동" 알림음을 내고,
// 탭이 가려져 있으면 허용된 경우에 한해 윈도우 알림도 띄운다. 실시간 연결이 끊기면 1분마다, 연결된 동안에도
// 3분마다(publication 누락·조용한 끊김 대비) 대기 건수를 확인해 늘었을 때 알린다 — 이미 알린 id 는 다시 뜨지 않는다. 알림에는 이름·진료·출처만 쓰고 주민번호·연락처·주소는 쓰지 않는다.
export function RemoteConsultAlerter() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [alerts, setAlerts] = useState<AlertState>(EMPTY_ALERT_STATE);
  const alertsRef = useRef<AlertState>(EMPTY_ALERT_STATE);
  // 1분 확인에서 "이후에 들어온 것"을 가리는 기준(DB의 created_at)과 직전 대기 건수.
  const baselineRef = useRef<string | null>(null);
  const baselineReadyRef = useRef(false);
  const lastCountRef = useRef<number | null>(null);

  const announce = useCallback(
    (items: RemoteAlertItem[]) => {
      for (const item of items) baselineRef.current = laterIso(baselineRef.current, item.createdAt);
      const { state, fresh } = pushAlerts(alertsRef.current, items);
      if (fresh.length === 0) return;
      alertsRef.current = state;
      setAlerts(state);
      void playChime();
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const { title, body } = browserNotificationText(fresh);
          const n = new Notification(title, { body, tag: 'remote-consult-new' });
          n.onclick = () => {
            window.focus();
            router.push('/remote-consult-alerts');
            n.close();
          };
        } catch {
          // 브라우저 알림이 막혀 있어도 화면 팝업은 그대로 뜬다.
        }
      }
      // 왼쪽 메뉴 배지·홈 요약(서버에서 그린 숫자)을 다시 읽고, 신청 화면이 열려 있으면 목록도 새로 읽게 한다.
      router.refresh();
      window.dispatchEvent(new CustomEvent(REMOTE_NEW_EVENT));
    },
    [router]
  );

  // 처음 화면이 뜰 때 기준 시각·건수를 잡아 둔다(그 전에 들어온 신청은 알리지 않는다).
  const initBaseline = useCallback(async () => {
    try {
      const [latest, count] = await Promise.all([latestRemoteCreatedAt(supabase), countNewRemoteRequests(supabase)]);
      baselineRef.current = laterIso(baselineRef.current, latest);
      lastCountRef.current = count;
      baselineReadyRef.current = true;
    } catch {
      // 다음 확인 때 다시 잡는다.
    }
  }, [supabase]);

  // 기준 시각 이후에 들어온 대기 신청을 모두 알린다(실시간이 끊겼다 다시 붙었을 때 빠진 것 채우기).
  const catchUp = useCallback(async () => {
    if (!baselineReadyRef.current) return;
    try {
      announce(await listNewRemoteAlertItemsSince(supabase, baselineRef.current));
    } catch {
      // 다음 확인 때 다시 본다.
    }
  }, [supabase, announce]);

  // 1분(끊겼을 때)·3분(안전 확인)마다: 대기 건수가 늘었으면 무엇이 들어왔는지 읽어 알린다.
  const poll = useCallback(async () => {
    if (!baselineReadyRef.current) {
      await initBaseline();
      return;
    }
    const count = await countNewRemoteRequests(supabase);
    const prev = lastCountRef.current;
    if (count !== null) lastCountRef.current = count;
    if (countIncreased(prev, count)) {
      await catchUp();
    }
    // 대기로 되돌리기·다른 직원의 처리로 숫자만 바뀐 경우에도 배지는 맞춰 둔다.
    if (count !== null && prev !== null && count !== prev) router.refresh();
  }, [supabase, initBaseline, catchUp, router]);

  useEffect(() => unlockChimeOnFirstInteraction(), []);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;
    let wasDown = false;

    const startPolling = () => {
      if (pollTimer !== null) return;
      pollTimer = window.setInterval(() => void poll(), REMOTE_POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (pollTimer === null) return;
      window.clearInterval(pollTimer);
      pollTimer = null;
    };

    void initBaseline();
    // 실시간 상태와 상관없이 늘 도는 느린 안전 확인. 실시간으로 이미 알린 신청은 id 로 걸러져 두 번 뜨지 않는다.
    const safetyTimer = window.setInterval(() => void poll(), REMOTE_SAFETY_POLL_INTERVAL_MS);

    const unsubscribe = subscribeToNewRemoteRequests(
      supabase,
      async (id) => {
        // payload 는 id 만 쓰고, 알림에 필요한 칸(이름·진료·출처)만 다시 읽는다. 바로 못 읽으면 잠깐 뒤 한 번 더.
        let item = await fetchRemoteAlertItem(supabase, id);
        if (!item && !cancelled) {
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
          item = await fetchRemoteAlertItem(supabase, id);
        }
        if (cancelled) return;
        if (item) {
          announce([item]);
        } else {
          router.refresh();
          window.dispatchEvent(new CustomEvent(REMOTE_NEW_EVENT));
        }
        // 실시간으로 받은 만큼 건수도 맞춰 둬서, 나중에 1분 확인으로 바뀌어도 같은 신청을 "늘었다"로 보지 않게 한다.
        const n = await countNewRemoteRequests(supabase);
        if (n !== null) lastCountRef.current = n;
      },
      (status) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          stopPolling();
          // 끊겨 있던 사이 들어온 신청을 한 번 채운다(이미 알린 것은 다시 뜨지 않는다).
          if (wasDown) void catchUp();
          wasDown = false;
        } else if (REALTIME_DOWN.has(status)) {
          wasDown = true;
          startPolling();
        }
      }
    );

    return () => {
      cancelled = true;
      window.clearInterval(safetyTimer);
      stopPolling();
      unsubscribe();
    };
  }, [supabase, router, announce, initBaseline, catchUp, poll]);

  function close(id: string) {
    const next = dismissAlert(alertsRef.current, id);
    alertsRef.current = next;
    setAlerts(next);
  }

  function closeAll() {
    const next = { ...alertsRef.current, queue: [] };
    alertsRef.current = next;
    setAlerts(next);
  }

  if (alerts.queue.length === 0) return null;

  return (
    <div className="remote-alert-stack" role="region" aria-label="새 비대면진료 신청 알림" aria-live="polite">
      {alerts.queue.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={closeAll}
            style={{ border: '1px solid var(--color-line)', background: 'var(--color-surface)', color: 'var(--color-muted)', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999 }}
          >
            모두 닫기 ({alerts.queue.length})
          </button>
        </div>
      )}
      {alerts.queue.map((a) => (
        <div key={a.id} className="card remote-alert-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }} aria-hidden="true">
              📨
            </span>
            <strong style={{ fontSize: 14 }}>새 비대면진료 신청</strong>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '1px 8px',
                borderRadius: 10,
                background: a.source === 'landing' ? 'rgba(62, 130, 196, 0.14)' : 'var(--color-surface-2)',
                color: a.source === 'landing' ? 'var(--color-blue)' : 'var(--color-muted)',
              }}
            >
              {alertSourceLabel(a)}
            </span>
            <button
              type="button"
              onClick={() => close(a.id)}
              aria-label="알림 닫기"
              style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--color-muted)', fontSize: 18, lineHeight: 1, padding: 2 }}
            >
              ×
            </button>
          </div>
          <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: 15 }}>{alertHeadline(a)}</p>
          <p className="muted-text" style={{ margin: '0 0 10px', fontSize: 12 }}>
            {formatSavedAt(a.createdAt)} 접수
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Link
              href="/remote-consult-alerts"
              className="btn-primary"
              onClick={() => close(a.id)}
              style={{ padding: '6px 14px', fontSize: 13, textDecoration: 'none' }}
            >
              신청 보러 가기
            </Link>
            <RemoteNotifyButton />
          </div>
        </div>
      ))}
    </div>
  );
}
