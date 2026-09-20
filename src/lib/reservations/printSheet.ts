// 내일 예약 시트 인쇄용 — 주치의별로 묶고 초진/재초진 표시를 붙이는 순수 함수.
import {
  classifyVisit,
  isSamePatient,
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
  const key = reservationKey(row);
  const candidate = candidates.find((c) => {
    const candidateKey: PersonKey = { name: c.patientName, chartNo: c.chartNo, phones: [c.phone] };
    return isSamePatient(candidateKey, key);
  });
  if (!candidate) return null;
  const kind = classifyVisit(candidate.previousVisitDates, date);
  if (kind === '재초진') return '재초진';
  if (kind === '초진(추정)') return candidate.possibleHomonym ? '초진?' : '초진';
  return null;
}
