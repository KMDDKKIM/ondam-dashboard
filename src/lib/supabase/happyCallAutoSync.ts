import type { SupabaseClient } from '@supabase/supabase-js';
import type { FirstVisitCandidatesResult } from '@/lib/firstVisit';
import type { HistoryContact } from '@/lib/happyCallContactFill';
import { mergeCandidateContacts, planContactFill } from '@/lib/happyCallContactFill';
import { matchDoctorId, pickCandidateInfo, planBirthFill, planReceptionRegistrations } from '@/lib/happyCallAutoRegister';
import { planRevisitFill } from '@/lib/happyCallRevisitFill';
import { isPastHideWindow } from '@/lib/happyCallVisibility';
import { todayKst } from '@/lib/kst';
import { doctorsAsStaffList, listDoctors } from './doctors';
import { createHappyCallPatient, listAutoSkipKeys, listHappyCallPatients, updateHappyCallPatient } from './happyCallPatients';
import { listVisitHistoryContacts } from './patientVisitHistory';
import { getReceptionCoverageStart, listReceptionEntriesSince } from './receptionRecords';

export interface AutoSyncResult {
  /** 접수기록부의 초진·재초진을 해피콜 표에 새로 올린 사람 수 */
  created: number;
  birthFilled: number;
  /** 2진·3진을 채운 환자 수 */
  revisitFilled: number;
  /** 차트번호·연락처를 채운 환자 수 */
  contactFilled: number;
}

const EMPTY: AutoSyncResult = { created: 0, birthFilled: 0, revisitFilled: 0, contactFilled: 0 };
const MIN_INTERVAL_MS = 3 * 60 * 1000;
let inflight: Promise<AutoSyncResult> | null = null;
let lastDoneAt = 0;

async function fetchCandidates(dates: string[]): Promise<Map<string, FirstVisitCandidatesResult['candidates']>> {
  const byDate = new Map<string, FirstVisitCandidatesResult['candidates']>();
  const sorted = [...new Set(dates)].sort();
  for (let i = 0; i < sorted.length; i += 4) {
    await Promise.all(
      sorted.slice(i, i + 4).map(async (date) => {
        try {
          const response = await fetch(`/api/first-visit-candidates?date=${encodeURIComponent(date)}`);
          if (response.ok) byDate.set(date, ((await response.json()) as FirstVisitCandidatesResult).candidates);
        } catch {
          // 후보 정보가 없으면 차트번호·연락처·진료의는 비워 두고 직접 입력한다.
        }
      })
    );
  }
  return byDate;
}

/**
 * 접수기록부를 기준으로 초진환자 해피콜 표를 자동으로 맞춘다. 원장 결정: 성함+생년월일이 같은 두 사람은 없다.
 *  1) 초진/재초진으로 적힌 접수를 표에 올린다(구분은 건보). 직원이 표에서 지운 사람은 다시 올리지 않는다.
 *  2) 비어 있는 생년월일을 초진일 접수 기록에서 채운다.
 *  3) 성함+생년월일로 2진·3진 빈 칸을 채운다.
 *  4) 최근(3주 안) 환자의 비어 있는 차트번호·연락처를 일일결산·예약 명단·저장된 내원 이력에서 같은 이름이 한 사람일 때만 채운다.
 * 이미 적힌 값은 건드리지 않는다. 화면을 열 때마다 불러도 되도록 3분 안에 다시 부르면 건너뛰고, 동시에 여러 번 불러도 한 번만 돈다.
 * 마이그레이션 전이거나 실패하면 조용히 빈 결과를 돌려준다 — 직접 등록·입력은 그대로 된다.
 */
export function syncHappyCallFromReception(supabase: SupabaseClient, options: { force?: boolean } = {}): Promise<AutoSyncResult> {
  if (inflight) return inflight;
  if (!options.force && Date.now() - lastDoneAt < MIN_INTERVAL_MS) return Promise.resolve(EMPTY);
  inflight = run(supabase)
    .catch(() => EMPTY)
    .finally(() => {
      inflight = null;
      lastDoneAt = Date.now();
    });
  return inflight;
}

async function run(supabase: SupabaseClient): Promise<AutoSyncResult> {
  const coverageStart = await getReceptionCoverageStart(supabase);
  if (!coverageStart) return EMPTY;
  const entries = await listReceptionEntriesSince(supabase, coverageStart);
  const skipKeys = await listAutoSkipKeys(supabase);
  const staff = doctorsAsStaffList(await listDoctors(supabase));
  const today = todayKst();

  // 다른 사람이 방금 올린 것과 겹치지 않도록 올리기 직전에 표를 읽는다.
  const current = await listHappyCallPatients(supabase);
  const newOnes = planReceptionRegistrations(entries, current, skipKeys, today);
  const needsContact = (p: { chartNo?: string | null; phone?: string | null; firstVisitDate: string }) =>
    (!(p.chartNo ?? '').trim() || !(p.phone ?? '').trim()) && !isPastHideWindow(p.firstVisitDate, today);
  const candidates = await fetchCandidates([...newOnes.map((n) => n.firstVisitDate), ...current.filter(needsContact).map((p) => p.firstVisitDate)]);

  const result: AutoSyncResult = { ...EMPTY };
  if (newOnes.length > 0) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    for (const n of newOnes) {
      const info = pickCandidateInfo(n.patientName, candidates.get(n.firstVisitDate) ?? []);
      try {
        await createHappyCallPatient(supabase, {
          patientName: n.patientName,
          doctorStaffId: info ? matchDoctorId(info.doctorName, staff) || null : null,
          patientType: '건보',
          firstVisitDate: n.firstVisitDate,
          createdBy: user?.id ?? null,
          visitKind: n.visitKind,
          chartNo: info?.chartNo ?? null,
          phone: info?.phone ?? null,
          birthDate: n.birthDate,
        });
        result.created++;
      } catch {
        // 한 명이 실패해도 나머지는 계속 올린다. 다음에 화면을 열 때 다시 시도한다.
      }
    }
  }

  let rows = result.created > 0 ? await listHappyCallPatients(supabase) : current;

  const births = planBirthFill(rows, entries);
  const filledBirths: typeof births = [];
  for (const b of births) {
    try {
      await updateHappyCallPatient(supabase, b.id, { birthDate: b.birthDate });
      filledBirths.push(b);
    } catch {
      // 같은 초진일·성함·생년월일이 이미 있는 줄(중복 방지 인덱스)이면 건너뛴다.
    }
  }
  result.birthFilled = filledBirths.length;
  if (filledBirths.length > 0) rows = rows.map((p) => ({ ...p, birthDate: filledBirths.find((b) => b.id === p.id)?.birthDate ?? p.birthDate }));

  const revisits = planRevisitFill(rows, entries, coverageStart, today);
  for (const fill of revisits.fills) {
    const patch: { revisit1?: string; revisit2?: string } = {};
    if (fill.revisit1) patch.revisit1 = fill.revisit1;
    if (fill.revisit2) patch.revisit2 = fill.revisit2;
    await updateHappyCallPatient(supabase, fill.id, patch);
  }
  result.revisitFilled = revisits.fills.length;

  const targets = rows.filter(needsContact);
  if (targets.length > 0) {
    const byChart = new Map<string, HistoryContact>();
    try {
      for (const h of await listVisitHistoryContacts(supabase)) byChart.set(h.chartNo.trim(), { ...h, visitDates: [] });
    } catch {
      // 저장된 내원 이력이 없으면 일일결산·예약 명단 자료만 쓴다.
    }
    for (const [date, list] of candidates) mergeCandidateContacts(byChart, date, list);
    const plan = planContactFill(
      targets.map((p) => ({ id: p.id, patientName: p.patientName, chartNo: p.chartNo, phone: p.phone, firstVisitDate: p.firstVisitDate })),
      [...byChart.values()]
    );
    for (const fill of plan.fills) {
      const patch: { chartNo?: string; phone?: string } = {};
      if (fill.chartNo) patch.chartNo = fill.chartNo;
      if (fill.phone) patch.phone = fill.phone;
      await updateHappyCallPatient(supabase, fill.id, patch);
    }
    result.contactFilled = plan.fills.length;
  }
  return result;
}
