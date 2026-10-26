// 내일 예약 시트 인쇄용 — 주치의별로 묶고 초진/재초진 표시를 붙이는 순수 함수.
import {
  classifyVisit,
  isSamePatient,
  normalizePhone,
  reservationKey,
  type FirstVisitCandidateDto,
  type PersonKey,
} from '../firstVisit';
import type { Reservation } from './types';

export const UNASSIGNED_DOCTOR = '주치의 미지정';

export interface DoctorSheet {
  doctorName: string;
  rows: Reservation[];
}

/** 취소된 예약은 시트에서 뺀다. 주치의 이름순(미지정은 맨 뒤), 같은 주치의 안에서는 예약시간순. */
export function groupByDoctor(reservations: Reservation[]): DoctorSheet[] {
  const map = new Map<string, Reservation[]>();
  for (const row of reservations) {
    if (row.visitStatus === '취소') continue;
    const doctor = row.doctorName.trim() || UNASSIGNED_DOCTOR;
    if (!map.has(doctor)) map.set(doctor, []);
    map.get(doctor)!.push(row);
  }
  return [...map.entries()]
    .map(([doctorName, rows]) => ({
      doctorName,
      rows: [...rows].sort((a, b) => a.timeLabel.localeCompare(b.timeLabel)),
    }))
    .sort((a, b) => {
      if (a.doctorName === UNASSIGNED_DOCTOR) return 1;
      if (b.doctorName === UNASSIGNED_DOCTOR) return -1;
      return a.doctorName.localeCompare(b.doctorName, 'ko');
    });
}

export type VisitMarker = '초진' | '초진?' | '재초진' | null;

/**
 * 예약 한 줄에 붙일 표시. 이전 예약 기록(내원으로 표시된 날)이 없으면 '초진',
 * 이름은 같은데 번호를 확인할 수 없는 이전 기록만 있으면 '초진?', 마지막 내원이 3개월 이상 전이면 '재초진'.
 * candidates 를 못 구했으면(null) 표시하지 않는다.
 */
export function visitMarkerFor(
  row: Reservation,
  candidates: FirstVisitCandidateDto[] | null,
  date: string
): VisitMarker {
  if (!candidates) return null;
  // 차트번호도 전화번호도 없으면 이전 기록과 대조할 방법이 없다 — 초진으로 단정하지 않고 "초진?"으로 알린다.
  if (!row.chartNo.trim() && !normalizePhone(row.mobile) && !normalizePhone(row.phone)) return '초진?';
  const key = reservationKey(row);
  const candidate = candidates.find((c) => {
    const candidateKey: PersonKey = { name: c.patientName, chartNo: c.chartNo, phones: [c.phone] };
    return isSamePatient(candidateKey, key);
  });
  if (!candidate) return null;
  // 서버가 이전 내원 이력·차트번호로 정한 판정이 있으면 그것을, 없으면(옛 응답) 예약 기록의 이전 내원일로 판정한다.
  const kind = candidate.kind ?? classifyVisit(candidate.previousVisitDates, date);
  if (kind === '재초진') return '재초진';
  if (kind === '초진(추정)') return candidate.possibleHomonym ? '초진?' : '초진';
  return null;
}

/** 인쇄 시트 한 줄(주치의 이름을 칸으로 붙인다). */
export interface PrintRow extends Reservation {
  printDoctor: string;
}

/**
 * 가로 A4 한 장에 전체 예약을 예약시간 순으로 한 표에 담는다(주치의별로 페이지를 나누지 않는다).
 * 취소된 예약은 뺀다. 같은 시간이면 성함 순.
 */
export function flattenForPrint(reservations: Reservation[]): PrintRow[] {
  return reservations
    .filter((r) => r.visitStatus !== '취소')
    .map((r) => ({ ...r, printDoctor: r.doctorName.trim() || UNASSIGNED_DOCTOR }))
    .sort((a, b) => a.timeLabel.localeCompare(b.timeLabel) || a.patientName.localeCompare(b.patientName, 'ko'));
}

/** 주치의별 인원 요약: [{ doctorName, count }] — 인쇄 머리글용(주치의 이름순, 미지정은 맨 뒤). */
export function countByDoctor(rows: { printDoctor: string }[]): { doctorName: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.printDoctor, (map.get(r.printDoctor) ?? 0) + 1);
  return [...map.entries()]
    .map(([doctorName, count]) => ({ doctorName, count }))
    .sort((a, b) => {
      if (a.doctorName === UNASSIGNED_DOCTOR) return 1;
      if (b.doctorName === UNASSIGNED_DOCTOR) return -1;
      return a.doctorName.localeCompare(b.doctorName, 'ko');
    });
}

/**
 * 가로 A4 한 장(위아래 여백 6mm)에 들어가도록 인원수에 따라 글자 크기(pt)를 정한다. 위쪽에 현황 패널·주별 현황 표가 같이 찍혀서(약 45mm)
 * 예전보다 한 장에 들어가는 인원이 줄었다 — 7pt 로 41명까지 한 장이고, 더 많으면 다음 장으로 이어진다(표 머리글은 장마다 반복).
 * 기준은 실제 인쇄 레이아웃에서 잰 줄 높이다(11pt 약 5.2mm … 7pt 약 3.5mm).
 */
export const PRINT_MAX_ONE_PAGE = 41;

export function printFontPt(count: number): number {
  if (count <= 28) return 11;
  if (count <= 30) return 10;
  if (count <= 33) return 9;
  if (count <= 37) return 8;
  return 7;
}
