import { describe, expect, it } from 'vitest';
import {
  EMPTY_ALERT_STATE,
  MAX_REMOTE_ALERTS,
  REMOTE_POLL_INTERVAL_MS,
  REMOTE_SAFETY_POLL_INTERVAL_MS,
  alertHeadline,
  alertSourceLabel,
  browserNotificationText,
  countIncreased,
  dismissAlert,
  laterIso,
  pushAlerts,
  type RemoteAlertItem,
} from './remoteAlert';

function item(id: string, extra: Partial<RemoteAlertItem> = {}): RemoteAlertItem {
  return { id, source: 'landing', patientName: '홍길동', service: '보폐고 엔오', createdAt: '2026-10-07T01:00:00.000Z', ...extra };
}

describe('pushAlerts / dismissAlert', () => {
  it('새 신청은 차례로 쌓이고, 같은 id는 두 번 알리지 않는다(실시간 + 1분 확인이 겹쳐도)', () => {
    const first = pushAlerts(EMPTY_ALERT_STATE, [item('a')]);
    expect(first.fresh.map((x) => x.id)).toEqual(['a']);
    const second = pushAlerts(first.state, [item('a'), item('b')]);
    expect(second.fresh.map((x) => x.id)).toEqual(['b']);
    expect(second.state.queue.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('닫은 알림은 사라지지만 다시 들어와도 또 뜨지 않는다', () => {
    const { state } = pushAlerts(EMPTY_ALERT_STATE, [item('a'), item('b')]);
    const closed = dismissAlert(state, 'a');
    expect(closed.queue.map((x) => x.id)).toEqual(['b']);
    const again = pushAlerts(closed, [item('a')]);
    expect(again.fresh).toEqual([]);
    expect(again.state).toBe(closed);
  });

  it('너무 많이 쌓이면 오래된 것부터 빠진다', () => {
    const many = Array.from({ length: MAX_REMOTE_ALERTS + 3 }, (_, i) => item(`id${i}`));
    const { state } = pushAlerts(EMPTY_ALERT_STATE, many);
    expect(state.queue).toHaveLength(MAX_REMOTE_ALERTS);
    expect(state.queue[0].id).toBe('id3');
  });
});

describe('countIncreased / laterIso', () => {
  it('대기 건수가 늘었을 때만 true, 못 읽은 값(null)은 비교하지 않는다', () => {
    expect(countIncreased(2, 3)).toBe(true);
    expect(countIncreased(3, 3)).toBe(false);
    expect(countIncreased(3, 2)).toBe(false);
    expect(countIncreased(null, 3)).toBe(false);
    expect(countIncreased(3, null)).toBe(false);
  });

  it('더 늦은 시각을 고른다', () => {
    expect(laterIso(null, '2026-10-07T01:00:00Z')).toBe('2026-10-07T01:00:00Z');
    expect(laterIso('2026-10-07T01:00:00Z', null)).toBe('2026-10-07T01:00:00Z');
    expect(laterIso('2026-10-07T01:00:00Z', '2026-10-07T02:00:00+00:00')).toBe('2026-10-07T02:00:00+00:00');
    expect(laterIso('2026-10-07T03:00:00Z', '2026-10-07T02:00:00Z')).toBe('2026-10-07T03:00:00Z');
  });
});

describe('알림 문구', () => {
  it('팝업에는 이름 · 진료와 출처를 보여 준다', () => {
    expect(alertHeadline(item('a'))).toBe('홍길동 · 보폐고 엔오');
    expect(alertHeadline(item('a', { patientName: ' ', service: '' }))).toBe('(이름 없음)');
    expect(alertSourceLabel(item('a'))).toBe('웹페이지');
    expect(alertSourceLabel(item('a', { source: 'google_form' }))).toBe('구글폼');
  });

  it('브라우저 알림에는 환자 이름을 넣지 않는다', () => {
    const one = browserNotificationText([item('a')]);
    expect(one.body).toContain('웹페이지 · 보폐고 엔오');
    expect(one.body).not.toContain('홍길동');
    expect(browserNotificationText([item('a'), item('b')]).body).toContain('2건');
  });
});

describe('확인 간격', () => {
  it('끊겼을 때는 1분, 연결된 동안의 안전 확인은 그보다 느린 3분', () => {
    expect(REMOTE_POLL_INTERVAL_MS).toBe(60000);
    expect(REMOTE_SAFETY_POLL_INTERVAL_MS).toBe(180000);
    expect(REMOTE_SAFETY_POLL_INTERVAL_MS).toBeGreaterThan(REMOTE_POLL_INTERVAL_MS);
  });

  it('실시간과 안전 확인이 같은 신청을 둘 다 가져와도 한 번만 알린다', () => {
    const viaRealtime = pushAlerts(EMPTY_ALERT_STATE, [item('a')]);
    const viaSafetyPoll = pushAlerts(viaRealtime.state, [item('a'), item('b')]);
    expect(viaSafetyPoll.fresh.map((x) => x.id)).toEqual(['b']);
    expect(viaSafetyPoll.state.queue.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
