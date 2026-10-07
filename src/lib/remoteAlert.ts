// 비대면진료 새 신청 알림(대시보드 안 팝업·알림음·브라우저 알림)의 순수 로직.
// 실시간(Supabase Realtime)으로 받든, 실시간이 끊겨 1분마다 건수를 확인하든 같은 신청을 두 번 알리지 않도록
// "이미 알린 id" 기준으로 쌓는다. 주민번호·연락처·주소는 알림에 쓰지 않는다.
import { SOURCE_LABEL, type RemoteSource } from '@/lib/remoteConsult';

export interface RemoteAlertItem {
  id: string;
  source: RemoteSource;
  patientName: string;
  service: string;
  createdAt: string; // ISO (DB 시각)
}

/** 새 신청이 들어왔을 때 window 에 쏘는 이벤트 이름 — 비대면진료 신청 화면이 열려 있으면 이걸 듣고 목록을 다시 읽는다. */
export const REMOTE_NEW_EVENT = 'remote-consult:new';

/** 실시간이 끊겼을 때 대기 건수를 확인하는 간격. */
export const REMOTE_POLL_INTERVAL_MS = 60000;

/**
 * 실시간이 "연결됨"이라고 하는 동안에도 도는 느린 안전 확인 간격. 마이그레이션(publication 등록)이 빠졌거나 채널이
 * 에러 없이 조용히 이벤트를 안 주는 경우를 메운다. 이미 알린 id 는 다시 알리지 않으므로 겹쳐도 두 번 뜨지 않는다.
 */
export const REMOTE_SAFETY_POLL_INTERVAL_MS = 180000;

/** 화면에 쌓아 두는 알림 최대 개수 — 넘치면 오래된 것부터 빠진다(목록 화면에는 그대로 남아 있다). */
export const MAX_REMOTE_ALERTS = 8;

/** 이미 알린 id 를 기억하는 개수(브라우저 메모리). */
const MAX_SEEN_IDS = 300;

export interface AlertState {
  queue: RemoteAlertItem[];
  seen: string[];
}

export const EMPTY_ALERT_STATE: AlertState = { queue: [], seen: [] };

/** 새로 알릴 것만 골라 쌓는다. fresh 는 이번에 실제로 새로 쌓인 것(알림음·브라우저 알림 대상). */
export function pushAlerts(state: AlertState, items: RemoteAlertItem[]): { state: AlertState; fresh: RemoteAlertItem[] } {
  const seen = new Set(state.seen);
  const fresh: RemoteAlertItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    fresh.push(item);
  }
  if (fresh.length === 0) return { state, fresh };
  return {
    state: {
      queue: [...state.queue, ...fresh].slice(-MAX_REMOTE_ALERTS),
      seen: Array.from(seen).slice(-MAX_SEEN_IDS),
    },
    fresh,
  };
}

/** 알림 하나를 닫는다(본 기록은 남겨 두어 다시 뜨지 않게 한다). */
export function dismissAlert(state: AlertState, id: string): AlertState {
  return { ...state, queue: state.queue.filter((a) => a.id !== id) };
}

/** 1분 확인에서 대기 건수가 늘었을 때만 무엇이 들어왔는지 더 읽는다(못 읽은 값 null 은 비교하지 않는다). */
export function countIncreased(prev: number | null, next: number | null): boolean {
  return prev !== null && next !== null && next > prev;
}

/** 기준 시각을 가장 늦은 created_at 으로 옮긴다(ISO 문자열은 그대로 비교해도 순서가 맞다). */
export function laterIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(b).getTime() > new Date(a).getTime() ? b : a;
}

/** 팝업 한 줄: "홍길동 · 보폐고 엔오" */
export function alertHeadline(item: Pick<RemoteAlertItem, 'patientName' | 'service'>): string {
  const name = item.patientName.trim() || '(이름 없음)';
  const service = item.service.trim();
  return service ? `${name} · ${service}` : name;
}

export function alertSourceLabel(item: Pick<RemoteAlertItem, 'source'>): string {
  return SOURCE_LABEL[item.source];
}

/**
 * 탭이 가려져 있을 때 띄우는 브라우저(윈도우) 알림 문구. 윈도우 알림 센터에 남아 다른 사람 눈에 띌 수 있어
 * 환자 이름은 넣지 않는다.
 */
export function browserNotificationText(items: Pick<RemoteAlertItem, 'source' | 'service'>[]): { title: string; body: string } {
  const title = '📨 새 비대면진료 신청';
  if (items.length === 1) {
    const item = items[0];
    const service = item.service.trim();
    return { title, body: `${SOURCE_LABEL[item.source]}${service ? ` · ${service}` : ''} — 대시보드에서 확인해 주세요.` };
  }
  return { title, body: `${items.length}건이 새로 들어왔어요 — 대시보드에서 확인해 주세요.` };
}
