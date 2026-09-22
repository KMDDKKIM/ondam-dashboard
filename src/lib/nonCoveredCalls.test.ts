import { describe, expect, it } from 'vitest';
import { callTypeForPurchase, desiredCalls, planCallResync, type ExistingCall } from './nonCoveredCalls';

function existing(slot: 1 | 2 | 3, callDate: string, extra: Partial<ExistingCall> = {}): ExistingCall {
  return { slot, id: `e${slot}`, callDate, note: null, closed: false, attempts: 0, ...extra };
}

describe('desiredCalls', () => {
  it('수령일 + 처방일수: 한약 공식으로 3회', () => {
    expect(desiredCalls('공진단', '2026-09-20', 30)).toEqual([
      { slot: 1, callDate: '2026-09-22', note: '공진단 수령확인' },
      { slot: 2, callDate: '2026-09-30', note: '공진단 중간상담' },
      { slot: 3, callDate: '2026-10-15', note: '공진단 연복권유' },
    ]);
  });

  it('수령일만: 다음날 1회, 수령일 없음: 콜 없음', () => {
    expect(desiredCalls('침', '2026-09-20', null)).toEqual([
      { slot: 1, callDate: '2026-09-21', note: '비급여 구매 후속 - 침' },
    ]);
    expect(desiredCalls('침', null, 30)).toEqual([]);
  });
});

describe('planCallResync', () => {
  const want = desiredCalls('공진단', '2026-09-20', 30);
  const wantNotes = new Map(want.map((w) => [w.slot, w.note]));
  const same = (slot: 1 | 2 | 3, date: string, extra: Partial<ExistingCall> = {}) =>
    existing(slot, date, { note: wantNotes.get(slot) ?? null, ...extra });

  it('이미 맞으면 아무것도 하지 않는다', () => {
    const have = [same(1, '2026-09-22'), same(2, '2026-09-30'), same(3, '2026-10-15')];
    expect(planCallResync(want, have)).toEqual([]);
  });

  it('수령일을 바꾸면 열린 콜의 날짜를 옮긴다', () => {
    const moved = desiredCalls('공진단', '2026-09-25', 30);
    const have = [same(1, '2026-09-22'), same(2, '2026-09-30'), same(3, '2026-10-15')];
    const ops = planCallResync(moved, have);
    expect(ops.map((o) => o.type)).toEqual(['update', 'update', 'update']);
    expect(ops[0]).toMatchObject({ slot: 1, id: 'e1', callDate: '2026-09-27' });
  });

  it('이미 끝난 콜과 이미 시도한(부재중 재시도) 콜은 건드리지 않는다', () => {
    const moved = desiredCalls('공진단', '2026-09-25', 30);
    const have = [
      same(1, '2026-09-22', { closed: true }),
      same(2, '2026-10-06', { attempts: 1 }),
      same(3, '2026-10-15'),
    ];
    const ops = planCallResync(moved, have);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ type: 'update', slot: 3, id: 'e3' });
  });

  it('처방일수를 지우면 열린 2·3차는 지우고 1차는 남긴다', () => {
    const one = desiredCalls('공진단', '2026-09-20', null);
    const have = [same(1, '2026-09-22'), same(2, '2026-09-30'), same(3, '2026-10-15', { closed: true })];
    const ops = planCallResync(one, have);
    // 1차: 문구만 달라진다(단일 콜 문구). 2차: 지움. 3차(종료됨): 그대로.
    expect(ops).toEqual([
      { type: 'update', slot: 1, id: 'e1', callDate: '2026-09-21', note: '비급여 구매 후속 - 공진단' },
      { type: 'remove', slot: 2, id: 'e2' },
    ]);
  });

  it('처방일수를 새로 넣으면 없는 2·3차를 만든다', () => {
    const have = [existing(1, '2026-09-21', { note: '비급여 구매 후속 - 공진단' })];
    const ops = planCallResync(want, have);
    expect(ops.map((o) => `${o.type}:${o.slot}`)).toEqual(['update:1', 'create:2', 'create:3']);
  });

  it('수령일을 지우면 열린 콜을 모두 지운다', () => {
    const have = [same(1, '2026-09-22'), same(2, '2026-09-30', { closed: true })];
    expect(planCallResync([], have)).toEqual([{ type: 'remove', slot: 1, id: 'e1' }]);
  });
});

describe('callTypeForPurchase', () => {
  it('린다이어트·린데일리는 린다이어트, 처방일수가 있거나 한약류면 한약, 그 밖은 비급여', () => {
    expect(callTypeForPurchase('린다이어트', null)).toBe('린다이어트');
    expect(callTypeForPurchase('린데일리', null)).toBe('린다이어트');
    expect(callTypeForPurchase('일반한약', null)).toBe('한약');
    expect(callTypeForPurchase('녹용2배공진단', null)).toBe('한약');
    expect(callTypeForPurchase('경옥고', null)).toBe('한약');
    expect(callTypeForPurchase('무슨약침', 15)).toBe('한약');
    expect(callTypeForPurchase('약침 패키지', null)).toBe('비급여');
  });
});
