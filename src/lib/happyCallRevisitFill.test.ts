import { describe, expect, it } from 'vitest';
import { personKey, planRevisitFill, type ReceptionVisit, type RevisitTarget } from './happyCallRevisitFill';

// 이름·생년월일은 모두 시험용 가짜 값이다(실제 환자 정보를 넣지 않는다).
const COVERAGE = '2026-09-22';
const TODAY = '2026-10-03';
const visit = (visitDate: string, o: Partial<ReceptionVisit> = {}): ReceptionVisit => ({ visitDate, patientName: '가나다', birthDate: '80.1.1', excluded: false, ...o });
const target = (o: Partial<RevisitTarget> = {}): RevisitTarget => ({ id: 't1', patientName: '가나다', birthDate: '80.1.1', firstVisitDate: '2026-09-22', revisit1: null, revisit2: null, ...o });

describe('planRevisitFill', () => {
  it('초진일 이후의 내원 두 번을 2진·3진으로 채운다', () => {
    const plan = planRevisitFill([target()], [visit('2026-09-22'), visit('2026-09-25'), visit('2026-09-30')], COVERAGE, TODAY);
    expect(plan.fills).toEqual([{ id: 't1', revisit1: '2026-09-25', revisit2: '2026-09-30' }]);
  });

  it('같은 날 여러 번 접수돼도 하루로 센다', () => {
    const plan = planRevisitFill([target()], [visit('2026-09-22'), visit('2026-09-25'), visit('2026-09-25'), visit('2026-09-30')], COVERAGE, TODAY);
    expect(plan.fills[0]).toMatchObject({ revisit1: '2026-09-25', revisit2: '2026-09-30' });
  });

  it('내원이 한 번뿐이면 2진만 채운다', () => {
    const plan = planRevisitFill([target()], [visit('2026-09-22'), visit('2026-09-25')], COVERAGE, TODAY);
    expect(plan.fills).toEqual([{ id: 't1', revisit1: '2026-09-25' }]);
  });

  it('3번째 이후 내원은 넣지 않는다', () => {
    const plan = planRevisitFill([target()], [visit('2026-09-25'), visit('2026-09-26'), visit('2026-09-27'), visit('2026-09-28')], COVERAGE, TODAY);
    expect(plan.fills).toEqual([{ id: 't1', revisit1: '2026-09-25', revisit2: '2026-09-26' }]);
  });

  it('이미 적힌 날짜는 건드리지 않고 빈 칸만 채운다', () => {
    const plan = planRevisitFill([target({ revisit1: '2026-09-25' })], [visit('2026-09-25'), visit('2026-09-30')], COVERAGE, TODAY);
    expect(plan.fills).toEqual([{ id: 't1', revisit2: '2026-09-30' }]);
  });

  it('2진·3진이 다 적혀 있으면 대상이 아니다', () => {
    const plan = planRevisitFill([target({ revisit1: '2026-09-25', revisit2: '2026-09-30' })], [visit('2026-10-01')], COVERAGE, TODAY);
    expect(plan.fills).toEqual([]);
    expect(plan.beforeCoverage).toBe(0);
  });

  it('접수기록부 시작 전에 초진인 환자는 건너뛴다(중간 내원을 몰라 잘못 채울 수 있어서)', () => {
    const plan = planRevisitFill([target({ firstVisitDate: '2026-09-10' })], [visit('2026-09-25')], COVERAGE, TODAY);
    expect(plan.fills).toEqual([]);
    expect(plan.beforeCoverage).toBe(1);
  });

  it('"제외" 표시된 내원은 재내원으로 세지 않는다', () => {
    const plan = planRevisitFill([target()], [visit('2026-09-25', { excluded: true }), visit('2026-09-30')], COVERAGE, TODAY);
    expect(plan.fills).toEqual([{ id: 't1', revisit1: '2026-09-30' }]);
  });

  it('같은 이름이라도 생년월일이 다르면 다른 사람이다', () => {
    const plan = planRevisitFill([target()], [visit('2026-09-22'), visit('2026-09-25', { birthDate: '55.5.5' }), visit('2026-09-30')], COVERAGE, TODAY);
    expect(plan.fills).toEqual([{ id: 't1', revisit1: '2026-09-30' }]);
  });

  it('동명이인도 생년월일로 각자의 내원만 채운다', () => {
    const plan = planRevisitFill(
      [target({ id: 'a' }), target({ id: 'b', birthDate: '55.5.5', firstVisitDate: '2026-09-23' })],
      [
        visit('2026-09-22', { birthDate: '80.1.1' }),
        visit('2026-09-23', { birthDate: '55.5.5' }),
        visit('2026-09-26', { birthDate: '80.1.1' }),
        visit('2026-09-29', { birthDate: '55.5.5' }),
        visit('2026-09-30', { birthDate: null }),
      ],
      COVERAGE,
      TODAY
    );
    expect(plan.fills).toEqual([
      { id: 'a', revisit1: '2026-09-26' },
      { id: 'b', revisit1: '2026-09-29' },
    ]);
  });

  it('생년월일이 없는 환자는 건너뛴다', () => {
    const plan = planRevisitFill([target({ birthDate: null })], [visit('2026-09-25')], COVERAGE, TODAY);
    expect(plan.fills).toEqual([]);
    expect(plan.noBirth).toBe(1);
  });

  it('초진일 이전·오늘 이후 기록은 세지 않는다', () => {
    const plan = planRevisitFill([target({ firstVisitDate: '2026-09-25' })], [visit('2026-09-23'), visit('2026-10-10')], COVERAGE, TODAY);
    expect(plan.fills).toEqual([]);
  });
});

describe('personKey', () => {
  it('성함과 생년월일이 모두 있어야 키가 된다', () => {
    expect(personKey(' 가나다 ', ' 80.1.1 ')).toBe('가나다|80.1.1');
    expect(personKey('가나다', null)).toBeNull();
    expect(personKey('', '80.1.1')).toBeNull();
  });
});
