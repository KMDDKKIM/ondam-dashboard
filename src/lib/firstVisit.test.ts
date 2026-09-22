import { describe, it, expect } from 'vitest';
import {
  addMonthsKst,
  classifyVisit,
  dedupeVisitCandidates,
  hasPossibleHomonym,
  isPossibleHomonym,
  isSamePatient,
  previousVisitDatesFor,
  type ReservationLike,
  dedupeSettlementVisits,
  likelyNewChartNos,
  baseChartNo,
  classifySettlementCandidate,
  isReissuedChart,
  chartKey,
  exactChartKey,
  numericChartNo,
  maxChartNumber,
} from './firstVisit';

describe('addMonthsKst', () => {
  it('subtracts calendar months', () => {
    expect(addMonthsKst('2026-11-30', -3)).toBe('2026-08-30');
    expect(addMonthsKst('2026-02-15', -3)).toBe('2025-11-15');
  });
  it('clamps to the last day of a shorter month', () => {
    expect(addMonthsKst('2026-05-31', -3)).toBe('2026-02-28');
    expect(addMonthsKst('2028-05-31', -3)).toBe('2028-02-29');
  });
});

describe('classifyVisit', () => {
  const today = '2026-09-20';

  it('is 초진(추정) with no history', () => {
    expect(classifyVisit([], today)).toBe('초진(추정)');
  });

  it('is 재진 when the last visit was 2 months ago', () => {
    expect(classifyVisit(['2026-07-20', '2026-01-05'], today)).toBe('재진');
  });

  it('is 재초진 at exactly 3 calendar months', () => {
    expect(classifyVisit(['2026-06-20'], today)).toBe('재초진');
  });

  it('is 재진 one day short of 3 months', () => {
    expect(classifyVisit(['2026-06-21'], today)).toBe('재진');
  });

  it('is 재초진 at 5 months', () => {
    expect(classifyVisit(['2026-04-20'], today)).toBe('재초진');
  });

  it('judges by the LAST visit, not the first', () => {
    expect(classifyVisit(['2025-01-10', '2026-08-30'], today)).toBe('재진');
  });

  it('ignores same-day duplicates of today', () => {
    expect(classifyVisit([today, today], today)).toBe('초진(추정)');
    expect(classifyVisit([today, '2026-04-20'], today)).toBe('재초진');
  });

  it('counts duplicated earlier dates once', () => {
    expect(classifyVisit(['2026-04-20', '2026-04-20'], today)).toBe('재초진');
  });

  it('handles month-end edges', () => {
    expect(classifyVisit(['2026-08-30'], '2026-11-30')).toBe('재초진');
    expect(classifyVisit(['2026-08-31'], '2026-11-30')).toBe('재진');
    expect(classifyVisit(['2026-02-28'], '2026-05-31')).toBe('재초진');
    expect(classifyVisit(['2026-03-01'], '2026-05-31')).toBe('재진');
  });
});

describe('isSamePatient', () => {
  it('uses chart number when both have one', () => {
    expect(isSamePatient({ name: '김', chartNo: '1' }, { name: '이', chartNo: '1' })).toBe(true);
    expect(isSamePatient({ name: '김', chartNo: '1' }, { name: '김', chartNo: '2' })).toBe(false);
  });
  it('matches by chart number regardless of name typos', () => {
    expect(isSamePatient({ name: '김철수', chartNo: '77' }, { name: '김철슈', chartNo: '77' })).toBe(true);
  });
  it('does NOT match same name when a phone is missing', () => {
    expect(isSamePatient({ name: '김', phones: ['010-1111-2222'] }, { name: '김', phones: [] })).toBe(false);
    expect(isSamePatient({ name: '김' }, { name: '김' })).toBe(false);
    expect(isSamePatient({ name: '김', chartNo: '1', phones: [] }, { name: '김', phones: ['010'] })).toBe(false);
  });
  it('flags same name + missing phone as a possible homonym only', () => {
    expect(isPossibleHomonym({ name: '김', phones: ['010-1'] }, { name: '김', phones: [] })).toBe(true);
    expect(isPossibleHomonym({ name: '김', phones: ['010-1'] }, { name: '김', phones: ['010-1'] })).toBe(false);
    expect(isPossibleHomonym({ name: '김', chartNo: '1' }, { name: '김', chartNo: '2' })).toBe(false);
    expect(isPossibleHomonym({ name: '김', phones: ['010-1'] }, { name: '박', phones: [] })).toBe(false);
  });
  it('falls back to name + phone', () => {
    expect(isSamePatient({ name: '김', phones: ['010-1111-2222'] }, { name: '김', phones: ['01011112222'] })).toBe(true);
    expect(isSamePatient({ name: '김', phones: ['010-1111-2222'] }, { name: '김', phones: ['010-3333-4444'] })).toBe(false);
    expect(isSamePatient({ name: '김', chartNo: '1', phones: ['010'] }, { name: '박', phones: ['010'] })).toBe(false);
  });
});

describe('dedupeVisitCandidates / previousVisitDatesFor', () => {
  const row = (o: Partial<ReservationLike>): ReservationLike => ({
    patientName: '김',
    chartNo: '',
    phone: '',
    mobile: '',
    visitStatus: '',
    doctorName: '원장',
    timeLabel: '09:00',
    ...o,
  });

  it('drops cancelled rows and merges same-day duplicates', () => {
    const list = dedupeVisitCandidates([
      row({ chartNo: '10', mobile: '010-1' }),
      row({ chartNo: '10', timeLabel: '15:00' }),
      row({ patientName: '박', chartNo: '11', visitStatus: '취소' }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].phone).toBe('010-1');
  });

  it('collects sorted unique earlier dates for a candidate', () => {
    const cand = { patientName: '김', chartNo: '10', phone: '', doctorName: '', timeLabel: '' };
    const prior = [
      { date: '2026-05-01', patientName: '김', chartNo: '10', phone: '', mobile: '' },
      { date: '2026-05-01', patientName: '김', chartNo: '10', phone: '', mobile: '' },
      { date: '2026-03-01', patientName: '김', chartNo: '10', phone: '', mobile: '' },
      { date: '2026-05-02', patientName: '이', chartNo: '99', phone: '', mobile: '' },
      { date: '2026-09-20', patientName: '김', chartNo: '10', phone: '', mobile: '' },
    ];
    expect(previousVisitDatesFor(cand, prior, '2026-09-20')).toEqual(['2026-03-01', '2026-05-01']);
  });
});

describe('same-name history without a phone never hides a candidate', () => {
  const cand = { patientName: '김', chartNo: '', phone: '010-1111-2222', doctorName: '', timeLabel: '' };
  const oldNoPhone = { date: '2026-08-30', patientName: '김', chartNo: '', phone: '', mobile: '' };

  it('is not counted as a prior visit but is flagged (stays 초진(추정), never 재진)', () => {
    const dates = previousVisitDatesFor(cand, [oldNoPhone], '2026-09-20');
    expect(dates).toEqual([]);
    expect(classifyVisit(dates, '2026-09-20')).toBe('초진(추정)');
    expect(hasPossibleHomonym(cand, [oldNoPhone], '2026-09-20')).toBe(true);
  });

  it('same name + same phone is a real prior visit (재진 / 재초진), no flag', () => {
    const recent = { date: '2026-08-30', patientName: '김', chartNo: '', phone: '', mobile: '010-1111-2222' };
    const old = { date: '2026-04-01', patientName: '김', chartNo: '', phone: '01011112222', mobile: '' };
    expect(classifyVisit(previousVisitDatesFor(cand, [recent], '2026-09-20'), '2026-09-20')).toBe('재진');
    expect(classifyVisit(previousVisitDatesFor(cand, [old], '2026-09-20'), '2026-09-20')).toBe('재초진');
    expect(hasPossibleHomonym(cand, [recent], '2026-09-20')).toBe(false);
  });

  it('same chart number matches even with a name typo', () => {
    const c = { ...cand, chartNo: '55', patientName: '김철수' };
    const prior = [{ date: '2026-08-30', patientName: '김철슈', chartNo: '55', phone: '', mobile: '' }];
    expect(previousVisitDatesFor(c, prior, '2026-09-20')).toEqual(['2026-08-30']);
  });

  it('a registered same-name patient without phone does not hide the candidate', () => {
    const registered = { name: '김', chartNo: null, phones: [null] };
    expect(isSamePatient({ name: '김', chartNo: '', phones: ['010-1111-2222'] }, registered)).toBe(false);
  });

  it('drops cancelled and no-show reservations from the candidate list', () => {
    const r = (visitStatus: string) => ({ patientName: '박', chartNo: '9', phone: '', mobile: '', visitStatus, doctorName: '', timeLabel: '' });
    expect(dedupeVisitCandidates([r('취소'), r('노쇼')])).toEqual([]);
    expect(dedupeVisitCandidates([r('')])).toHaveLength(1);
  });
});

describe('dedupeSettlementVisits', () => {
  it('같은 차트번호는 한 명으로, 차트번호가 없으면 이름으로 묶는다', () => {
    const rows = [
      { patientName: '가상하나', chartNo: '004001', doctorName: '김동규' },
      { patientName: '가상하나', chartNo: '004001', doctorName: '김동규' },
      { patientName: '가상둘', chartNo: '', doctorName: '박소은' },
      { patientName: '가상둘', chartNo: '', doctorName: '박소은' },
      { patientName: ' ', chartNo: '1', doctorName: '' },
    ];
    expect(dedupeSettlementVisits(rows).map((c) => c.patientName)).toEqual(['가상하나', '가상둘']);
  });

  it('같은 차트를 패딩("006502")과 비패딩("6502")으로 섞어 적어도 한 명으로 묶는다(chartKey로 정규화)', () => {
    const rows = [
      { patientName: '가상하나', chartNo: '6502', doctorName: '김동규' },
      { patientName: '가상하나', chartNo: '006502', doctorName: '김동규' },
    ];
    expect(dedupeSettlementVisits(rows)).toHaveLength(1);
  });
});

describe('numericChartNo / maxChartNumber(텍스트 정렬이 아니라 숫자로 최댓값을 본다)', () => {
  it('numericChartNo: 앞자리 0과 재등록 "-N"을 떼고 숫자로 본다', () => {
    expect(numericChartNo('006502')).toBe(6502);
    expect(numericChartNo('6502')).toBe(6502);
    expect(numericChartNo('006366-1')).toBe(6366);
    expect(numericChartNo('AB')).toBeNull();
  });

  it('패딩/비패딩이 섞여도 진짜 숫자 최댓값을 찾는다 — 텍스트 정렬(내림차순)이면 "9"가 "006502"보다 앞에 와서 진짜 최댓값을 가릴 수 있다', () => {
    // 텍스트로 내림차순 정렬하면 "9"(값 9) 가 "089999"(값 89999)보다 앞에 온다 — 하지만 진짜 최댓값은 89999.
    const chartNos = ['9', '089999', '000123', '45'];
    expect(maxChartNumber(chartNos)).toBe(89999);
  });

  it('숫자가 아닌 차트번호는 무시하고, 숫자가 하나도 없으면 null', () => {
    expect(maxChartNumber(['AB', 'CD-1'])).toBeNull();
    expect(maxChartNumber([])).toBeNull();
    expect(maxChartNumber(['AB', '006502'])).toBe(6502);
  });

  it('실제 분류에 적용: 패딩된 큰 차트("089999")가 섞여 있으면, 그보다 작은 새 차트는 재진으로 가려지면 안 된다', () => {
    // 기존 차트: 비패딩 "9"(9번, 사실 작은 값) + 패딩 "089999"(89999번, 진짜 최댓값).
    const maxKnownChart = maxChartNumber(['9', '089999']);
    expect(maxKnownChart).toBe(89999); // 텍스트 정렬 top-30 샘플식이면 여기서 9로 잘못 나올 수 있었다.

    // 새로 등록된 진짜 초진 환자: 차트번호 90000 (기존 최댓값보다 큼 → 초진이어야 함).
    const newPatient = classifySettlementCandidate({
      chartNo: '090000',
      previousVisitDates: [],
      date: '2026-09-22',
      newChartNos: null,
      maxKnownChart,
      registeredOnDate: false,
      windowCovered: false,
    });
    expect(newPatient.kind).toBe('초진(추정)');

    // 반대로, 텍스트 정렬 버그처럼 maxKnownChart가 9로 잘못 계산됐다면 90000 > 9라서 여전히 초진으로 나오니
    // 이 케이스만으로는 버그를 못 잡는다 — 실제 버그는 "새 환자 번호가 작아서 가려지는" 경우다.
    // 예: 새 환자 번호가 50000이면, (버그 없이) 진짜 최댓값 89999보다 작으므로 재진(예전 차트)으로 봐야 정상이다.
    const oldChart = classifySettlementCandidate({
      chartNo: '050000',
      previousVisitDates: [],
      date: '2026-09-22',
      newChartNos: null,
      maxKnownChart,
      registeredOnDate: false,
      windowCovered: false,
    });
    expect(oldChart.kind).toBe('재진');
  });
});

describe('likelyNewChartNos', () => {
  it('신규환자수 N명이면 차트번호가 가장 큰 N명', () => {
    const set = likelyNewChartNos(['004001', '006544', '006543', '006370'], 2);
    expect([...set!].sort()).toEqual(['006543', '006544']);
  });

  it('신규환자수 0이면 아무도 새 차트가 아니다', () => {
    expect(likelyNewChartNos(['004001', '006544'], 0)!.size).toBe(0);
  });

  it('신규환자수를 모르거나 차트번호가 숫자가 아니면 판단하지 않는다(null)', () => {
    expect(likelyNewChartNos(['1', '2'], null)).toBeNull();
    expect(likelyNewChartNos(['A-1', '2'], 1)).toBeNull();
    expect(likelyNewChartNos([], 1)).toBeNull();
  });
});

describe('baseChartNo / 재등록 차트', () => {
  it('"-1" 재등록 차트는 같은 환자로 본다', () => {
    expect(baseChartNo('006366-1')).toBe('006366');
    expect(baseChartNo('006366')).toBe('006366');
    expect(isSamePatient({ name: '가', chartNo: '006366', phones: [] }, { name: '가', chartNo: '006366-1', phones: [] })).toBe(true);
    expect(isSamePatient({ name: '가', chartNo: '006366', phones: [] }, { name: '가', chartNo: '006367', phones: [] })).toBe(false);
  });
});

describe('classifySettlementCandidate', () => {
  const base = { chartNo: '004001', previousVisitDates: [] as string[], date: '2026-09-22', newChartNos: null, maxKnownChart: 6544, registeredOnDate: false, windowCovered: true };

  it('이전 내원 기록이 3개월 안이면 재진, 3개월 이상 전이면 재초진', () => {
    expect(classifySettlementCandidate({ ...base, previousVisitDates: ['2026-08-01'] }).kind).toBe('재진');
    expect(classifySettlementCandidate({ ...base, previousVisitDates: ['2026-05-01'] }).kind).toBe('재초진');
  });

  it('기록이 없어도 차트 등록일이 내원일이거나 기존 차트보다 번호가 크면 초진', () => {
    expect(classifySettlementCandidate({ ...base, chartNo: '006543', registeredOnDate: true }).kind).toBe('초진(추정)');
    expect(classifySettlementCandidate({ ...base, chartNo: '006545' }).kind).toBe('초진(추정)');
  });

  it('예전 차트인데 3개월 기록을 다 가지고 있는데도 내원 기록이 없으면 재초진', () => {
    const r = classifySettlementCandidate({ ...base, chartNo: '004001' });
    expect(r.kind).toBe('재초진');
  });

  it('3개월 기록이 완전하지 않으면 재초진이라고 단정하지 않는다 — 이미 있던 차트는 재진, 기존 차트 번호를 모르면 초진(추정)', () => {
    expect(classifySettlementCandidate({ ...base, windowCovered: false }).kind).toBe('재진');
    expect(classifySettlementCandidate({ ...base, windowCovered: false, newChartNos: new Set(['006543']) }).kind).toBe('재진');
    expect(classifySettlementCandidate({ ...base, windowCovered: false, maxKnownChart: null }).kind).toBe('초진(추정)');
  });

  it('이미 있던 차트(기존 최대 번호 이하)는 예약 기록이 없어도 초진이 아니다', () => {
    const r = classifySettlementCandidate({ ...base, chartNo: '006191', windowCovered: false });
    expect(r.kind).toBe('재진');
  });

  it('신규환자수 기준 새 차트도 초진', () => {
    expect(classifySettlementCandidate({ ...base, chartNo: '006543', newChartNos: new Set(['006543']), windowCovered: false, maxKnownChart: null }).kind).toBe('초진(추정)');
  });

  it('재등록 차트(-1)는 원래 차트로 이력을 본다', () => {
    expect(classifySettlementCandidate({ ...base, chartNo: '006366-1', previousVisitDates: ['2026-09-01'] }).kind).toBe('재진');
  });
});

describe('재등록 차트(-1)의 재초진', () => {
  const base = { chartNo: '000058-1', previousVisitDates: [] as string[], date: '2026-09-22', newChartNos: null, maxKnownChart: 6544, registeredOnDate: false, windowCovered: true };

  it('isReissuedChart', () => {
    expect(isReissuedChart('000058-1')).toBe(true);
    expect(isReissuedChart('006544')).toBe(false);
  });

  it('이전 기록이 없으면 재초진이고 결산 신규환자수에 이미 들어 있다고 표시한다', () => {
    const r = classifySettlementCandidate(base);
    expect(r.kind).toBe('재초진');
    expect(r.countedInNewCount).toBe(true);
  });

  it('이전 내원 기록이 있으면 그 기록대로(재진) 판정하고 신규 표시는 없다', () => {
    const r = classifySettlementCandidate({ ...base, previousVisitDates: ['2026-09-10'] });
    expect(r.kind).toBe('재진');
    expect(r.countedInNewCount).toBeUndefined();
  });

  it('일반 예전 차트의 재초진은 신규환자수에 들어 있지 않다', () => {
    const r = classifySettlementCandidate({ ...base, chartNo: '001985' });
    expect(r.kind).toBe('재초진');
    expect(r.countedInNewCount).toBeUndefined();
  });
});

describe('차트번호 표기 차이(6502 / 006502)', () => {
  it('앞의 0과 재등록 -1을 떼고 같은 차트로 본다', () => {
    expect(chartKey('006502')).toBe('6502');
    expect(chartKey('6502')).toBe('6502');
    expect(chartKey('006366-1')).toBe('6366');
    expect(chartKey('AB')).toBe('AB');
    expect(exactChartKey('006366-1')).toBe('6366-1');
    expect(exactChartKey('006366')).toBe('6366');
  });

  it('isSamePatient: 6502 와 006502 는 같은 차트', () => {
    expect(isSamePatient({ name: '가', chartNo: '6502', phones: [] }, { name: '가', chartNo: '006502', phones: [] })).toBe(true);
    expect(isSamePatient({ name: '가', chartNo: '6502', phones: [] }, { name: '가', chartNo: '006503', phones: [] })).toBe(false);
  });
});
