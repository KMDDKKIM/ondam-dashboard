// 한약 처방 대기방의 순수 로직(신청 검증, 정렬, 시각 표기).

export type HerbQueueStatus = 'waiting' | 'done';

export interface HerbQueueItem {
  id: string;
  patientName: string;
  chartNo: string;
  doctorName: string;
  herbDesc: string;
  note: string;
  status: HerbQueueStatus;
  requestedByName: string;
  createdAt: string;
  doneByName: string;
  doneAt: string | null;
}

export interface HerbQueueDraft {
  patientName: string;
  chartNo: string;
  doctorName: string;
  herbDesc: string;
  note: string;
}

/** 신청에 꼭 필요한 것: 환자 성함, 주치의, 한약/횟차. 빠진 항목 이름을 돌려준다(없으면 빈 배열). */
export function missingFields(draft: HerbQueueDraft): string[] {
  const missing: string[] = [];
  if (!draft.patientName.trim()) missing.push('환자 성함');
  if (!draft.doctorName.trim()) missing.push('주치의');
  if (!draft.herbDesc.trim()) missing.push('한약/횟차');
  return missing;
}

/** 대기 중인 신청은 먼저 신청한 순서대로. */
export function sortWaiting(items: HerbQueueItem[]): HerbQueueItem[] {
  return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** 완료한 신청은 최근에 끝낸 것이 위로. */
export function sortDone(items: HerbQueueItem[]): HerbQueueItem[] {
  return [...items].sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '') || b.id.localeCompare(a.id));
}

/** "9/21 14:05" — 신청·완료 시각을 한국 시간으로 짧게. */
export function formatQueueTime(iso: string | null): string {
  if (!iso) return '';
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${m}/${d} ${hh}:${mm}`;
}

/**
 * 왼쪽 메뉴·홈의 "한약 대기" 알림을 누구 기준으로 셀지 정한다.
 * 로그인한 사람의 이름이 진료의 목록에 있으면(자신이 진료의) 그 진료의로 신청된 것만 세고,
 * 진료의가 아니면(데스크 직원) 전체를 센다 — 데스크는 모든 신청을 알아야 하기 때문이다.
 */
export function resolveHerbQueueDoctorFilter(staffName: string | null, doctorNames: readonly string[]): string | null {
  if (!staffName) return null;
  return doctorNames.includes(staffName) ? staffName : null;
}
