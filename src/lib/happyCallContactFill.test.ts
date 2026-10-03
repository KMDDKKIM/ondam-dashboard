import { describe, expect, it } from 'vitest';
import { planContactFill, type FillTarget, type HistoryContact } from './happyCallContactFill';

// 아래 이름·번호는 모두 시험용 가짜 값이다(실제 환자 정보를 넣지 않는다).
const hist = (o: Partial<HistoryContact>): HistoryContact => ({
  chartNo: '000001',
  patientName: '가나다',
  phone: '010-0000-0001',
  registeredDate: '2026-09-01',
  firstVisit: '2026-09-01',
  ...o,
});
const target = (o: Partial<FillTarget>): FillTarget => ({ id: 't1', patientName: '가나다', firstVisitDate: '2026-09-01', ...o });

describe('planContactFill', () => {
  it('이름+초진일(차트 등록일)이 맞으면 차트번호·연락처를 채운다', () => {
    const plan = planContactFill([target({})], [hist({})]);
    expect(plan.fills).toEqual([{ id: 't1', chartNo: '000001', phone: '010-0000-0001' }]);
  });

  it('재초진은 차트 등록일이 달라도 기간 중 처음 내원일이 초진일과 같으면 찾는다', () => {
    const plan = planContactFill([target({})], [hist({ registeredDate: '2019-01-01', firstVisit: '2026-09-01' })]);
    expect(plan.fills).toHaveLength(1);
  });

  it('동명이인은 초진일로 가려 각자의 차트번호를 채운다', () => {
    const plan = planContactFill(
      [target({ id: 'a', firstVisitDate: '2026-09-01' }), target({ id: 'b', firstVisitDate: '2026-09-10' })],
      [hist({ chartNo: '000001', registeredDate: '2026-09-01', firstVisit: '2026-09-01' }), hist({ chartNo: '000002', registeredDate: '2026-09-10', firstVisit: '2026-09-10', phone: '010-0000-0002' })]
    );
    expect(plan.fills).toEqual([
      { id: 'a', chartNo: '000001', phone: '010-0000-0001' },
      { id: 'b', chartNo: '000002', phone: '010-0000-0002' },
    ]);
  });

  it('초진일로도 못 가리는 동명이인은 건너뛴다', () => {
    const plan = planContactFill(
      [target({})],
      [hist({ chartNo: '000001' }), hist({ chartNo: '000002', phone: '010-0000-0002' })]
    );
    expect(plan.fills).toEqual([]);
    expect(plan.ambiguous).toBe(1);
  });

  it('이미 적힌 값은 덮어쓰지 않고 빈 칸만 채운다', () => {
    const plan = planContactFill([target({ chartNo: '000001', phone: null })], [hist({})]);
    expect(plan.fills).toEqual([{ id: 't1', phone: '010-0000-0001' }]);
    const both = planContactFill([target({ chartNo: '000001', phone: '010-9999-9999' })], [hist({})]);
    expect(both.fills).toEqual([]);
  });

  it('연락처만 적힌 환자는 그 번호가 같은 사람으로 찾아 차트번호를 채운다', () => {
    const plan = planContactFill(
      [target({ phone: '01000000002' })],
      [hist({ chartNo: '000001' }), hist({ chartNo: '000002', phone: '010-0000-0002' })]
    );
    expect(plan.fills).toEqual([{ id: 't1', chartNo: '000002' }]);
  });

  it('끝까지 안 적힌 번호("010")는 연락처로 채우지 않는다', () => {
    const plan = planContactFill([target({})], [hist({ phone: '010' })]);
    expect(plan.fills).toEqual([{ id: 't1', chartNo: '000001' }]);
  });

  it('이력에 없는 이름은 못 찾은 것으로 센다', () => {
    const plan = planContactFill([target({ patientName: '없는사람' })], [hist({})]);
    expect(plan).toEqual({ fills: [], ambiguous: 0, notFound: 1 });
  });

  it('두 환자가 같은 이력 줄을 가리키면 둘 다 건너뛴다', () => {
    const plan = planContactFill([target({ id: 'a' }), target({ id: 'b' })], [hist({})]);
    expect(plan.fills).toEqual([]);
    expect(plan.ambiguous).toBe(2);
  });

  it('차트번호·연락처가 다 있는 환자는 대상이 아니다', () => {
    const plan = planContactFill([target({ chartNo: '000001', phone: '010-0000-0001' })], [hist({})]);
    expect(plan).toEqual({ fills: [], ambiguous: 0, notFound: 0 });
  });

  it('내원 이력의 날짜는 안 맞아도 일일결산·예약 명단으로 확인된 내원일이 초진일과 같으면 찾는다', () => {
    const plan = planContactFill([target({})], [hist({ registeredDate: '2019-01-01', firstVisit: '2026-06-30', visitDates: ['2026-09-01'] })]);
    expect(plan.fills).toHaveLength(1);
  });
});
