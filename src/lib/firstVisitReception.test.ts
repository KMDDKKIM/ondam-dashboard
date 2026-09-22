import { describe, expect, it } from 'vitest';
import { mergeReceptionCandidates, type FirstVisitCandidateDto, type FirstVisitCandidatesResult, type ReceptionVisitRow } from './firstVisit';
import { hasReliableFirstVisitBasis, matchRegisteredCandidates, reconcileFirstVisits } from './firstVisitReconcile';

const DATE = '2026-09-22';

function base(over: Partial<FirstVisitCandidateDto> = {}): FirstVisitCandidateDto {
  return {
    patientName: '홍길동',
    chartNo: '100',
    phone: '',
    doctorName: '',
    timeLabel: '',
    previousVisitDates: [],
    possibleHomonym: false,
    kind: '초진(추정)',
    countedInNewCount: false,
    ...over,
  };
}

function rec(over: Partial<ReceptionVisitRow> = {}): ReceptionVisitRow {
  return { id: 'r1', patientName: '홍길동', visitKind: '초진', birthDate: null, ...over };
}

function result(over: Partial<FirstVisitCandidatesResult>): FirstVisitCandidatesResult {
  return { date: DATE, hasRecord: true, closingFirstVisitCount: null, candidates: [], ...over };
}

describe('mergeReceptionCandidates', () => {
  it('결산 후보와 같은 이름이면 한 명으로 본다(줄을 더하지 않는다)', () => {
    const m = mergeReceptionCandidates([base()], [rec()], DATE);
    expect(m.candidates).toHaveLength(1);
    expect(m.candidates[0].fromReception).toBeUndefined();
    expect(m.receptionFirstCount).toBe(1);
  });

  it('이름 앞뒤 공백은 무시한다', () => {
    const m = mergeReceptionCandidates([base({ patientName: '홍길동' })], [rec({ patientName: ' 홍길동 ' })], DATE);
    expect(m.candidates).toHaveLength(1);
  });

  it('접수기록부에만 있는 사람은 후보로 더한다(이름만, 차트번호·연락처는 비움)', () => {
    const m = mergeReceptionCandidates([base()], [rec({ id: 'r9', patientName: '성춘향' })], DATE);
    expect(m.candidates).toHaveLength(2);
    expect(m.candidates[1]).toMatchObject({
      patientName: '성춘향',
      chartNo: '',
      phone: '',
      kind: '초진(추정)',
      kindReason: '접수기록부에서 초진으로 적혔어요',
      possibleHomonym: false,
      fromReception: true,
      receptionId: 'r9',
    });
  });

  it('재초는 재초진으로 더한다', () => {
    const m = mergeReceptionCandidates([], [rec({ visitKind: '재초진', patientName: '이몽룡' })], DATE);
    expect(m.candidates[0]).toMatchObject({ kind: '재초진', kindReason: '접수기록부에서 재초진으로 적혔어요' });
    expect(m.receptionRevisitCount).toBe(1);
    expect(m.receptionFirstCount).toBe(0);
  });

  it('재진 줄과 빈 이름은 무시한다', () => {
    const m = mergeReceptionCandidates([], [rec({ visitKind: '재진' }), rec({ patientName: '  ' })], DATE);
    expect(m.candidates).toHaveLength(0);
  });

  it('이름이 같은 후보가 결산에서 재진이면 다른 사람일 수 있어 동명이인 가능으로 남긴다', () => {
    const m = mergeReceptionCandidates([base({ kind: '재진' })], [rec()], DATE);
    expect(m.candidates).toHaveLength(2);
    expect(m.candidates[1]).toMatchObject({ fromReception: true, possibleHomonym: true });
  });

  it('이름이 같은 결산 후보가 둘이면 접수 줄 하나는 한 명만 가져가고, 접수 줄이 더 많으면 남는 줄은 동명이인 가능으로 남는다', () => {
    const two = [base({ chartNo: '100' }), base({ chartNo: '200' })];
    expect(mergeReceptionCandidates(two, [rec()], DATE).candidates).toHaveLength(2);
    const both = mergeReceptionCandidates(two, [rec({ id: 'a' }), rec({ id: 'b' })], DATE);
    expect(both.candidates).toHaveLength(2);
    const three = mergeReceptionCandidates(two, [rec({ id: 'a' }), rec({ id: 'b' }), rec({ id: 'c' })], DATE);
    expect(three.candidates).toHaveLength(3);
    expect(three.candidates[2]).toMatchObject({ receptionId: 'c', possibleHomonym: true });
  });

  it('접수기록부 안의 같은 이름·같은 생년월일은 중복 입력으로 하나만 쓴다', () => {
    const m = mergeReceptionCandidates([], [rec({ id: 'a', birthDate: '800101' }), rec({ id: 'b', birthDate: '800101' })], DATE);
    expect(m.candidates).toHaveLength(1);
    expect(m.receptionFirstCount).toBe(1);
  });

  it('접수기록부 안의 같은 이름이 생년월일이 다르거나 비어 있으면 둘 다 남기고 동명이인 가능으로 표시한다', () => {
    const diff = mergeReceptionCandidates([], [rec({ id: 'a', birthDate: '800101' }), rec({ id: 'b', birthDate: '900202' })], DATE);
    expect(diff.candidates.map((c) => c.possibleHomonym)).toEqual([true, true]);
    const blank = mergeReceptionCandidates([], [rec({ id: 'a' }), rec({ id: 'b' })], DATE);
    expect(blank.candidates).toHaveLength(2);
    expect(blank.candidates.every((c) => c.possibleHomonym)).toBe(true);
  });

  it('예약 명단 기반(kind 없음) 후보는 이전 내원일로 판정해서 짝짓는다', () => {
    const revisit = { ...base(), kind: undefined, previousVisitDates: ['2026-09-01'] };
    expect(mergeReceptionCandidates([revisit], [rec()], DATE).candidates).toHaveLength(2); // 재진이라 짝지어지지 않음
    const first = { ...base(), kind: undefined, previousVisitDates: [] };
    expect(mergeReceptionCandidates([first], [rec()], DATE).candidates).toHaveLength(1);
  });
});

describe('matchRegisteredCandidates', () => {
  const nameOnly = { patientName: '홍길동', chartNo: null, phone: null };

  it('차트번호·연락처 없이 이름만 등록된 환자와 이름이 같은 접수 후보는 등록된 것으로 본다', () => {
    const c = mergeReceptionCandidates([], [rec()], DATE).candidates;
    const m = matchRegisteredCandidates(c, [nameOnly]);
    expect(m.registered.has(c[0])).toBe(true);
    expect(m.possibleHomonym.size).toBe(0);
  });

  it('등록 환자에게 차트번호나 연락처가 있으면 이름만으로 숨기지 않고 동명이인 가능으로 남긴다', () => {
    const c = mergeReceptionCandidates([], [rec()], DATE).candidates;
    for (const p of [
      { patientName: '홍길동', chartNo: '555', phone: null },
      { patientName: '홍길동', chartNo: null, phone: '010-1' },
    ]) {
      const m = matchRegisteredCandidates(c, [p]);
      expect(m.registered.size).toBe(0);
      expect(m.possibleHomonym.has(c[0])).toBe(true);
    }
  });

  it('이름만 등록된 환자와 차트번호 있는 환자가 같이 있으면 이름만 등록된 쪽과 짝짓는다', () => {
    const c = mergeReceptionCandidates([], [rec()], DATE).candidates;
    const m = matchRegisteredCandidates(c, [{ patientName: '홍길동', chartNo: '9', phone: null }, nameOnly]);
    expect(m.registered.has(c[0])).toBe(true);
  });

  it('결산 후보와 이미 짝지어진 등록 환자는 접수 후보에 다시 쓰이지 않는다', () => {
    const closing = base({ chartNo: '100' });
    const receptionOnly = mergeReceptionCandidates([base({ kind: '재진' })], [rec()], DATE).candidates[1];
    const m = matchRegisteredCandidates([closing, receptionOnly], [{ patientName: '홍길동', chartNo: '100', phone: null }]);
    expect(m.registered.has(closing)).toBe(true);
    expect(m.registered.has(receptionOnly)).toBe(false);
    expect(m.possibleHomonym.has(receptionOnly)).toBe(false);
  });

  it('이미 동명이인 가능 표시가 붙은 접수 후보는 이름만으로 등록됨 처리하지 않는다', () => {
    const c = mergeReceptionCandidates([], [rec({ id: 'a' }), rec({ id: 'b' })], DATE).candidates;
    expect(matchRegisteredCandidates(c, [nameOnly]).registered.size).toBe(0);
  });

  it('등록 환자 한 명은 접수 후보 한 명에게만 짝지어진다', () => {
    const c = [
      { ...base(), chartNo: '', fromReception: true, receptionId: 'a' },
      { ...base(), chartNo: '', fromReception: true, receptionId: 'b' },
    ];
    expect(matchRegisteredCandidates(c, [{ patientName: '홍길동' }]).registered.size).toBe(1);
  });
});

describe('reconcileFirstVisits + 접수기록부', () => {
  const recOnly = (name: string, id: string, kind: '초진' | '재초진' = '초진') =>
    mergeReceptionCandidates([], [rec({ id, patientName: name, visitKind: kind })], DATE).candidates[0];

  it('결산 신규환자수 기준에 접수기록부에만 있는 사람은 더해서 센다', () => {
    const data = result({
      source: 'settlement',
      closingFirstVisitCount: 2,
      candidates: [base({ patientName: 'A' }), base({ patientName: 'B', chartNo: '101' }), recOnly('C', 'c')],
      receptionFirstCount: 1,
    });
    const r = reconcileFirstVisits(data, 1, DATE);
    expect(r.expected).toBe(3);
    expect(r.missing).toBe(2);
    expect(r.expectedSource).toContain('접수기록부에만 있는 1명');
  });

  it('결산 후보와 겹치는 접수 줄은 기준을 늘리지 않는다', () => {
    const merged = mergeReceptionCandidates([base({ patientName: 'A' })], [rec({ patientName: 'A' })], DATE);
    const data = result({ source: 'settlement', closingFirstVisitCount: 1, candidates: merged.candidates, receptionFirstCount: merged.receptionFirstCount });
    const r = reconcileFirstVisits(data, 0, DATE);
    expect(r.expected).toBe(1);
    expect(r.receptionMore).toBe(0);
  });

  it('접수기록부에만 있는 재초진도 기준에 더한다', () => {
    const data = result({ source: 'settlement', closingFirstVisitCount: 1, candidates: [recOnly('C', 'c', '재초진')], receptionRevisitCount: 1 });
    expect(reconcileFirstVisits(data, 0, DATE).expected).toBe(2);
  });

  it('접수기록부에만 있는 사람이 이미 등록돼 있어도 기준에 센다(등록 수에도 들어 있으므로) — 다른 사람의 누락이 가려지지 않는다', () => {
    // 결산 신규환자수 2 = A, B. 접수기록부에만 있는 C는 등록됨. A도 등록됨, B는 아직.
    const data = result({
      source: 'settlement',
      closingFirstVisitCount: 2,
      candidates: [base({ patientName: 'A', chartNo: '1' }), base({ patientName: 'B', chartNo: '2' }), recOnly('C', 'c')],
      receptionFirstCount: 1,
    });
    const r = reconcileFirstVisits(data, 2, DATE); // 등록: A, C
    expect(r.expected).toBe(3);
    expect(r.missing).toBe(1);
  });

  it('결산 + 접수 + 등록이 섞인 경우: 겹치는 접수 줄은 더하지 않고, 접수에만 있는 재초진은 더한다', () => {
    const merged = mergeReceptionCandidates(
      [base({ patientName: 'A', chartNo: '1' }), base({ patientName: 'R', chartNo: '3', kind: '재초진' })],
      [rec({ id: 'a', patientName: 'A' }), rec({ id: 'x', patientName: 'X' }), rec({ id: 'y', patientName: 'Y', visitKind: '재초진' })],
      DATE
    );
    const data = result({
      source: 'settlement',
      closingFirstVisitCount: 1,
      candidates: merged.candidates,
      receptionFirstCount: merged.receptionFirstCount,
      receptionRevisitCount: merged.receptionRevisitCount,
    });
    // 신규 1 + 결산 재초진 후보 R 1 + 접수에만 있는 X, Y 2 = 4 ; 등록 A, X → missing 2
    const r = reconcileFirstVisits(data, 2, DATE);
    expect(r.expected).toBe(4);
    expect(r.missing).toBe(2);
  });

  it('결산 없이 예약 명단만 있고 접수기록부에 초/재초가 있으면 접수기록부 수를 기준으로 삼고 비교 가능하다', () => {
    const data = result({
      source: 'reservation',
      candidates: [base({ patientName: 'R1', kind: undefined }), base({ patientName: 'R2', chartNo: '2', kind: undefined }), recOnly('C', 'c')],
      receptionFirstCount: 1,
    });
    expect(hasReliableFirstVisitBasis(data)).toBe(true);
    const r = reconcileFirstVisits(data, 0, DATE);
    expect(r).toMatchObject({ expected: 1, missing: 1, expectedSource: '접수기록부 기준' });
    expect(hasReliableFirstVisitBasis(result({ source: 'reservation' }))).toBe(false);
  });

  it('접수기록부의 초가 결산 신규환자수보다 많으면 그 차이를 알린다', () => {
    const data = result({ source: 'settlement', closingFirstVisitCount: 1, candidates: [], receptionFirstCount: 3 });
    expect(reconcileFirstVisits(data, 0, DATE).receptionMore).toBe(2);
    expect(reconcileFirstVisits(result({ closingFirstVisitCount: 5, receptionFirstCount: 3 }), 0, DATE).receptionMore).toBe(0);
    expect(reconcileFirstVisits(result({ closingFirstVisitCount: null, receptionFirstCount: 3 }), 0, DATE).receptionMore).toBe(0);
  });

  it('접수기록부만 있는 날은 접수 후보 수가 기준이다', () => {
    const data = result({ source: 'reception', candidates: [recOnly('C', 'c'), recOnly('D', 'd', '재초진')], receptionFirstCount: 1, receptionRevisitCount: 1 });
    const r = reconcileFirstVisits(data, 1, DATE);
    expect(r).toMatchObject({ expected: 2, missing: 1, expectedSource: '접수기록부 기준' });
    expect(hasReliableFirstVisitBasis(data)).toBe(true);
  });
});
