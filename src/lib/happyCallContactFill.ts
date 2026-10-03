// 초진환자 해피콜 표에서 차트번호·연락처가 비어 있는 환자를, 저장해 둔 내원 이력(OK차트 "내원일수/진료비
// 분석" 표를 가져온 patient_visit_history)에서 찾아 채울 계획을 세운다. 순수 함수.
// 원칙: 이미 적힌 값은 절대 덮어쓰지 않고, 확실히 같은 사람으로 가려질 때만 채운다 — 동명이인이 섞이면
// 건너뛰고 건수만 알려 준다(잘못 채우는 것보다 비워 두는 게 낫다).
import { normalizePhone } from './firstVisit';

export interface HistoryContact {
  chartNo: string;
  patientName: string;
  phone: string | null;
  /** 차트 등록일 — 새 환자는 초진일과 같다. */
  registeredDate: string | null;
  /** 분석 기간 중 처음 내원일 — 재초진·예전 차트 환자는 이 날이 초진일과 같다. */
  firstVisit: string | null;
  /** 그 밖에 이 차트가 내원한 것으로 확인된 날짜(일일결산·예약 명단) — 초진일과 같으면 같은 사람으로 본다. */
  visitDates?: string[];
}

export interface FillTarget {
  id: string;
  patientName: string;
  chartNo?: string | null;
  phone?: string | null;
  firstVisitDate: string;
}

export interface ContactFill {
  id: string;
  /** 비어 있던 차트번호를 채운다(이미 있으면 없음). */
  chartNo?: string;
  /** 비어 있던 연락처를 채운다(이미 있으면 없음). */
  phone?: string;
}

export interface ContactFillPlan {
  fills: ContactFill[];
  /** 같은 이름이 여럿이라 누구인지 가릴 수 없어 건너뛴 환자 수. */
  ambiguous: number;
  /** 내원 이력에서 찾지 못한 환자 수. */
  notFound: number;
}

/** 전화번호로 쓸 수 있는 값인가 — "010"처럼 끝까지 안 적힌 번호는 채우지 않는다. */
function usablePhone(phone: string | null | undefined): string | null {
  const digits = normalizePhone(phone);
  return digits.length >= 9 ? (phone ?? '').trim() : null;
}

export function planContactFill(patients: FillTarget[], history: HistoryContact[]): ContactFillPlan {
  const byChart = new Map(history.map((h) => [h.chartNo.trim(), h]));
  const byName = new Map<string, HistoryContact[]>();
  for (const h of history) {
    const name = h.patientName.trim();
    byName.set(name, [...(byName.get(name) ?? []), h]);
  }

  type Pick = { target: FillTarget; row: HistoryContact } | 'ambiguous' | 'notFound';
  const picks: Pick[] = [];

  for (const target of patients) {
    const needsChart = !(target.chartNo ?? '').trim();
    const needsPhone = !(target.phone ?? '').trim();
    if (!needsChart && !needsPhone) continue;

    // 차트번호가 이미 있으면 그 차트번호로 정확히 찾는다.
    if (!needsChart) {
      const row = byChart.get((target.chartNo ?? '').trim());
      picks.push(row ? { target, row } : 'notFound');
      continue;
    }

    const sameName = byName.get(target.patientName.trim()) ?? [];
    if (sameName.length === 0) {
      picks.push('notFound');
      continue;
    }
    // 연락처가 이미 적혀 있으면 그 번호로, 아니면 초진일(차트 등록일 또는 기간 중 처음 내원일)로 가린다.
    const ownPhone = normalizePhone(target.phone);
    const narrowed = ownPhone
      ? sameName.filter((h) => normalizePhone(h.phone) === ownPhone)
      : sameName.filter(
          (h) => h.registeredDate === target.firstVisitDate || h.firstVisit === target.firstVisitDate || !!h.visitDates?.includes(target.firstVisitDate)
        );
    if (narrowed.length === 1) picks.push({ target, row: narrowed[0] });
    else picks.push(narrowed.length === 0 ? 'notFound' : 'ambiguous');
  }

  // 한 내원 이력 줄을 두 환자가 동시에 가리키면 누구 것인지 알 수 없으니 둘 다 건너뛴다.
  const claims = new Map<string, number>();
  for (const p of picks) if (typeof p === 'object') claims.set(p.row.chartNo, (claims.get(p.row.chartNo) ?? 0) + 1);

  const fills: ContactFill[] = [];
  let ambiguous = 0;
  let notFound = 0;
  for (const p of picks) {
    if (p === 'notFound') notFound++;
    else if (p === 'ambiguous' || (claims.get(p.row.chartNo) ?? 0) > 1) ambiguous++;
    else {
      const fill: ContactFill = { id: p.target.id };
      if (!(p.target.chartNo ?? '').trim()) fill.chartNo = p.row.chartNo.trim();
      const phone = usablePhone(p.row.phone);
      if (!(p.target.phone ?? '').trim() && phone) fill.phone = phone;
      if (fill.chartNo || fill.phone) fills.push(fill);
    }
  }
  return { fills, ambiguous, notFound };
}

/**
 * 그날 일일결산·예약 명단 후보(차트번호가 있는 것만)를 차트번호별로 한 줄로 합쳐 넣는다 — 이미 저장된 내원 이력과
 * 같은 차트면 그 줄에 내원일을 더하고, 아니면 새 줄을 만든다. 같은 차트가 두 줄이면 한 환자를 둘로 보아 건너뛰게 되기 때문이다.
 */
export function mergeCandidateContacts(
  byChart: Map<string, HistoryContact>,
  date: string,
  candidates: { patientName: string; chartNo: string; phone: string }[]
): void {
  for (const c of candidates) {
    // 차트번호가 없는 후보(접수기록부에서 온 이름뿐인 후보)는 채울 값이 없다.
    if (!c.chartNo) continue;
    const key = c.chartNo.trim();
    const known = byChart.get(key);
    if (known) {
      known.visitDates = [...(known.visitDates ?? []), date];
      if (!known.phone && c.phone) known.phone = c.phone;
    } else {
      byChart.set(key, { chartNo: c.chartNo, patientName: c.patientName, phone: c.phone || null, registeredDate: date, firstVisit: date, visitDates: [date] });
    }
  }
}

