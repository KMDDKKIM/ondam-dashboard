import { describe, it, expect } from 'vitest';
import {
  applyCallAction,
  postponeCall,
  undoCallAction,
  overdueDays,
  callOrdinal,
  firstVisitProgress,
  buildWorklist,
  isOpenAndDue,
  type WorklistItem,
  type CallProgress,
} from './happyCallQueue';
import { todayKst } from './kst';
import type { HappyCallPatient } from './types';

function makePatient(overrides: Partial<HappyCallPatient> = {}): HappyCallPatient {
  return {
    id: 'p1',
    patientName: '홍길동',
    doctorStaffId: null,
    patientType: '건보',
    acupunctureSuccess: null,
    firstVisitDate: '2026-09-17',
    revisit1: null,
    revisit2: null,
    jaboHerb1: null,
    jaboHerb2: null,
    jaboHerb3: null,
    nextVisitNote: null,
    callLog: null,
    memo: null,
    createdBy: null,
    createdAt: '2026-09-17T01:00:00Z',
    ...overrides,
  };
}

function makeItem(overrides: Partial<WorklistItem> = {}): WorklistItem {
  return {
    key: 'k1',
    kind: 'firstVisit',
    id: 'p1',
    patientName: '홍길동',
    phone: null,
    doctorStaffId: null,
    dueDate: '2026-09-20',
    originalDue: null,
    attempts: 0,
    result: null,
    closed: false,
    memo: null,
    note: null,
    callType: null,
    completedBy: null,
    completedAt: null,
    ...overrides,
  };
}

describe('applyCallAction', () => {
  it('closes the call on 통화완료 and keeps the due date', () => {
    const next = applyCallAction({ dueDate: '2026-09-20', attempts: 0 }, 'answered', '2026-09-20');
    expect(next).toEqual({ dueDate: '2026-09-20', attempts: 1, result: 'answered', closed: true, originalDue: null });
  });

  it('closes the call on 거부/연락불가', () => {
    const next = applyCallAction({ dueDate: '2026-09-20', attempts: 0 }, 'refused', '2026-09-20');
    expect(next).toEqual({ dueDate: '2026-09-20', attempts: 1, result: 'refused', closed: true, originalDue: null });
  });

  it('first 부재중 re-schedules the call for tomorrow and keeps it open', () => {
    const next = applyCallAction({ dueDate: '2026-09-20', attempts: 0 }, 'no_answer', '2026-09-20');
    expect(next).toEqual({ dueDate: '2026-09-21', attempts: 1, result: 'no_answer', closed: false, originalDue: '2026-09-20' });
  });

  it('second 부재중 closes the call as 연락 안 됨', () => {
    const next = applyCallAction({ dueDate: '2026-09-21', attempts: 1 }, 'no_answer', '2026-09-21');
    expect(next.result).toBe('unreachable');
    expect(next.closed).toBe(true);
    expect(next.attempts).toBe(2);
  });

  it('retry date is tomorrow of the day the attempt was made, even if the call was overdue', () => {
    // due 09-18, but the first attempt is only made on 09-20
    const next = applyCallAction({ dueDate: '2026-09-18', attempts: 0 }, 'no_answer', '2026-09-20');
    expect(next.dueDate).toBe('2026-09-21');
  });

  it('the retry is scheduled by the Seoul day, not the UTC day', () => {
    // 2026-09-20 23:30 KST = 14:30 UTC (still 09-20 in UTC)
    const nearMidnightKst = todayKst(new Date('2026-09-20T14:30:00Z'));
    expect(applyCallAction({ dueDate: '2026-09-20', attempts: 0 }, 'no_answer', nearMidnightKst).dueDate).toBe('2026-09-21');
    // 2026-09-21 00:30 KST = 15:30 UTC on 09-20 -> already the 21st in Seoul
    const afterMidnightKst = todayKst(new Date('2026-09-20T15:30:00Z'));
    expect(applyCallAction({ dueDate: '2026-09-20', attempts: 0 }, 'no_answer', afterMidnightKst).dueDate).toBe('2026-09-22');
  });

  it('does not skip weekends or month ends', () => {
    // 2026-09-19 is a Saturday
    expect(applyCallAction({ dueDate: '2026-09-19', attempts: 0 }, 'no_answer', '2026-09-19').dueDate).toBe('2026-09-20');
    expect(applyCallAction({ dueDate: '2026-09-30', attempts: 0 }, 'no_answer', '2026-09-30').dueDate).toBe('2026-10-01');
  });
});

describe('postponeCall', () => {
  it('moves an open call to tomorrow without counting an attempt', () => {
    expect(postponeCall({ dueDate: '2026-09-20', attempts: 0, result: null }, '2026-09-20')).toEqual({
      dueDate: '2026-09-21',
      attempts: 0,
      result: null,
      closed: false,
      originalDue: null,
    });
  });

  it('pulls an overdue call forward-to-tomorrow (not back to its old date)', () => {
    expect(postponeCall({ dueDate: '2026-09-15', attempts: 1, result: 'no_answer' }, '2026-09-20').dueDate).toBe('2026-09-21');
  });

  it('postponing a retry keeps the attempt count so the second 부재중 still closes it', () => {
    const postponed = postponeCall({ dueDate: '2026-09-21', attempts: 1, result: 'no_answer' }, '2026-09-21');
    expect(postponed.attempts).toBe(1);
    const next = applyCallAction(postponed, 'no_answer', '2026-09-22');
    expect(next.result).toBe('unreachable');
  });
});

describe('undoCallAction', () => {
  it('reopens a completed first call', () => {
    const done: CallProgress = applyCallAction({ dueDate: '2026-09-20', attempts: 0 }, 'answered', '2026-09-20');
    expect(undoCallAction(done, '2026-09-20')).toEqual({ dueDate: '2026-09-20', attempts: 0, result: null, closed: false, originalDue: null });
  });

  it('reopens a call closed by the second 부재중 back to the 1차 부재중 state', () => {
    const closed = applyCallAction({ dueDate: '2026-09-21', attempts: 1 }, 'no_answer', '2026-09-21');
    expect(undoCallAction(closed, '2026-09-21')).toEqual({
      dueDate: '2026-09-21',
      attempts: 1,
      result: 'no_answer',
      closed: false,
      originalDue: null,
    });
  });

  it('undoing a first 부재중 brings the call back to its original due date', () => {
    const retry = applyCallAction({ dueDate: '2026-09-20', attempts: 0 }, 'no_answer', '2026-09-20');
    expect(undoCallAction(retry, '2026-09-20')).toEqual({ dueDate: '2026-09-20', attempts: 0, result: null, closed: false, originalDue: null });
  });

  it('undoing a first 부재중 on an overdue call restores the old due date and keeps it overdue', () => {
    // due 09-15, first 부재중 on 09-18 moves it to 09-19
    const retry = applyCallAction({ dueDate: '2026-09-15', attempts: 0 }, 'no_answer', '2026-09-18');
    expect(retry.dueDate).toBe('2026-09-19');
    expect(retry.originalDue).toBe('2026-09-15');
    const undone = undoCallAction(retry, '2026-09-18');
    expect(undone.dueDate).toBe('2026-09-15');
    expect(undone.attempts).toBe(0);
    expect(undone.result).toBeNull();
    expect(undone.originalDue).toBeNull();
    expect(overdueDays(undone.dueDate, '2026-09-18')).toBe(3);
    expect(isOpenAndDue(undone, '2026-09-18')).toBe(true);
  });

  it('falls back to today when the original due date is unknown (older data)', () => {
    expect(undoCallAction({ dueDate: '2026-09-21', attempts: 1, result: 'no_answer' }, '2026-09-20').dueDate).toBe('2026-09-20');
  });

  it('keeps the original due date through the second 부재중 so both undo steps work', () => {
    const first = applyCallAction({ dueDate: '2026-09-15', attempts: 0 }, 'no_answer', '2026-09-18');
    const second = applyCallAction(first, 'no_answer', '2026-09-19');
    expect(second.closed).toBe(true);
    expect(second.originalDue).toBe('2026-09-15');
    const undoSecond = undoCallAction(second, '2026-09-19');
    expect(undoSecond).toEqual({ dueDate: '2026-09-19', attempts: 1, result: 'no_answer', closed: false, originalDue: '2026-09-15' });
    expect(undoCallAction(undoSecond, '2026-09-19').dueDate).toBe('2026-09-15');
  });

  it('postponing after a 부재중 keeps the original due date', () => {
    const first = applyCallAction({ dueDate: '2026-09-15', attempts: 0 }, 'no_answer', '2026-09-18');
    const postponed = postponeCall(first, '2026-09-19');
    expect(postponed.dueDate).toBe('2026-09-20');
    expect(postponed.originalDue).toBe('2026-09-15');
  });

  it('never goes below zero attempts', () => {
    expect(undoCallAction({ dueDate: '2026-09-20', attempts: 0, result: null }, '2026-09-20').attempts).toBe(0);
  });
});

describe('overdueDays / callOrdinal', () => {
  it('is 0 on the due day and counts calendar days afterwards', () => {
    expect(overdueDays('2026-09-20', '2026-09-20')).toBe(0);
    expect(overdueDays('2026-09-21', '2026-09-20')).toBe(0);
    expect(overdueDays('2026-09-19', '2026-09-20')).toBe(1);
    expect(overdueDays('2026-08-31', '2026-09-02')).toBe(2);
  });

  it('labels the first try as 1차 and the retry as 2차', () => {
    expect(callOrdinal(0)).toBe(1);
    expect(callOrdinal(1)).toBe(2);
  });
});

describe('firstVisitProgress', () => {
  it('defaults to the day after the first visit', () => {
    expect(firstVisitProgress(makePatient({ firstVisitDate: '2026-09-17' }))).toEqual({
      dueDate: '2026-09-18',
      attempts: 0,
      result: null,
      closed: false,
      originalDue: null,
    });
  });

  it('uses the stored due date and attempts after a 부재중', () => {
    const p = makePatient({ callDueDate: '2026-09-19', callOriginalDue: '2026-09-18', callAttempts: 1, callResult: 'no_answer' });
    expect(firstVisitProgress(p)).toEqual({
      dueDate: '2026-09-19',
      attempts: 1,
      result: 'no_answer',
      closed: false,
      originalDue: '2026-09-18',
    });
  });

  it('treats a stored closed result as closed', () => {
    for (const result of ['answered', 'refused', 'unreachable'] as const) {
      expect(firstVisitProgress(makePatient({ callResult: result, callAttempts: 1 })).closed).toBe(true);
    }
  });

  it('treats an old row that only has a call log as already answered', () => {
    const progress = firstVisitProgress(makePatient({ callLog: '통화 완료' }));
    expect(progress.closed).toBe(true);
    expect(progress.result).toBe('answered');
  });

  it('a 부재중 row stays open even if a call log was typed elsewhere', () => {
    expect(firstVisitProgress(makePatient({ callResult: 'no_answer', callAttempts: 1, callLog: 'x' })).closed).toBe(false);
  });
});

describe('isOpenAndDue', () => {
  it('is due on the due date and after, not before, and never when closed', () => {
    expect(isOpenAndDue({ closed: false, dueDate: '2026-09-20' }, '2026-09-19')).toBe(false);
    expect(isOpenAndDue({ closed: false, dueDate: '2026-09-20' }, '2026-09-20')).toBe(true);
    expect(isOpenAndDue({ closed: false, dueDate: '2026-09-20' }, '2026-09-25')).toBe(true);
    expect(isOpenAndDue({ closed: true, dueDate: '2026-09-20' }, '2026-09-25')).toBe(false);
  });
});

describe('buildWorklist - upcoming', () => {
  const today = '2026-09-21';

  it('예정일이 오늘보다 뒤인 미완료 콜은 upcoming 에, 가까운 날짜 순', () => {
    const items = [
      makeItem({ key: 'far', dueDate: '2026-09-30' }),
      makeItem({ key: 'near', dueDate: '2026-09-22' }),
      makeItem({ key: 'today', dueDate: '2026-09-21' }),
      makeItem({ key: 'done-future', dueDate: '2026-09-25', closed: true, result: 'answered' }),
    ];
    const w = buildWorklist(items, today);
    expect(w.upcoming.map((i) => i.key)).toEqual(['near', 'far']);
    expect(w.open.map((i) => i.key)).toEqual(['today']);
  });
});

describe('buildWorklist', () => {
  const today = '2026-09-20';

  it('lists overdue calls first, then today, and hides future and closed calls', () => {
    const items = [
      makeItem({ key: 'today', patientName: '가', dueDate: '2026-09-20' }),
      makeItem({ key: 'overdue-old', patientName: '나', dueDate: '2026-09-15' }),
      makeItem({ key: 'overdue-new', patientName: '다', dueDate: '2026-09-19' }),
      makeItem({ key: 'future', patientName: '라', dueDate: '2026-09-21' }),
      makeItem({ key: 'closed', patientName: '마', dueDate: '2026-09-18', closed: true, result: 'answered' }),
    ];
    expect(buildWorklist(items, today).open.map((i) => i.key)).toEqual(['overdue-old', 'overdue-new', 'today']);
  });

  it('a call postponed to tomorrow disappears today and shows up tomorrow', () => {
    const postponed = makeItem({ dueDate: '2026-09-21' });
    expect(buildWorklist([postponed], '2026-09-20').open).toHaveLength(0);
    expect(buildWorklist([postponed], '2026-09-21').open).toHaveLength(1);
  });

  it('puts calls processed today (closed or 1차 부재중) in doneToday, latest first', () => {
    const items = [
      makeItem({ key: 'a', closed: true, result: 'answered', completedAt: '2026-09-20T01:00:00Z' }), // 10:00 KST
      makeItem({ key: 'b', closed: false, result: 'no_answer', dueDate: '2026-09-21', completedAt: '2026-09-20T03:00:00Z' }),
      makeItem({ key: 'c', closed: true, result: 'refused', completedAt: '2026-09-19T01:00:00Z' }), // yesterday
    ];
    expect(buildWorklist(items, today).doneToday.map((i) => i.key)).toEqual(['b', 'a']);
  });

  it('decides "today" for completions by the Seoul date at the day boundary', () => {
    // 09-19 15:00Z = 09-20 00:00 KST -> today; 09-19 14:59Z = 09-19 23:59 KST -> yesterday
    const items = [
      makeItem({ key: 'start-of-day', closed: true, result: 'answered', completedAt: '2026-09-19T15:00:00Z' }),
      makeItem({ key: 'end-of-yesterday', closed: true, result: 'answered', completedAt: '2026-09-19T14:59:59Z' }),
      makeItem({ key: 'end-of-day', closed: true, result: 'answered', completedAt: '2026-09-20T14:59:59Z' }),
      makeItem({ key: 'start-of-tomorrow', closed: true, result: 'answered', completedAt: '2026-09-20T15:00:00Z' }),
    ];
    expect(
      buildWorklist(items, today)
        .doneToday.map((i) => i.key)
        .sort()
    ).toEqual(['end-of-day', 'start-of-day']);
  });

  it('does not list an open call that has no completion timestamp in doneToday', () => {
    expect(buildWorklist([makeItem()], today).doneToday).toHaveLength(0);
  });
});

describe('full timelines (rule walk-through)', () => {
  // 초진 콜 하나를 며칠에 걸쳐 굴려 본다. 매일 "목록에 뜨는가"를 확인.
  function listedOn(progress: CallProgress, day: string): boolean {
    return isOpenAndDue(progress, day);
  }

  it('answered on the first try', () => {
    // 초진 09-17 -> 콜 예정 09-18
    let p: CallProgress = firstVisitProgress(makePatient({ firstVisitDate: '2026-09-17' }));
    expect(listedOn(p, '2026-09-17')).toBe(false);
    expect(listedOn(p, '2026-09-18')).toBe(true);
    p = applyCallAction(p, 'answered', '2026-09-18');
    expect(listedOn(p, '2026-09-18')).toBe(false);
    expect(listedOn(p, '2026-09-19')).toBe(false);
  });

  it('부재중 twice closes as 연락 안 됨', () => {
    let p: CallProgress = firstVisitProgress(makePatient({ firstVisitDate: '2026-09-17' }));
    expect(listedOn(p, '2026-09-18')).toBe(true);
    p = applyCallAction(p, 'no_answer', '2026-09-18');
    expect(p.dueDate).toBe('2026-09-19');
    expect(listedOn(p, '2026-09-18')).toBe(false);
    expect(listedOn(p, '2026-09-19')).toBe(true);
    p = applyCallAction(p, 'no_answer', '2026-09-19');
    expect(p.result).toBe('unreachable');
    expect(listedOn(p, '2026-09-19')).toBe(false);
    expect(listedOn(p, '2026-09-20')).toBe(false);
  });

  it('postponed while busy, then answered', () => {
    let p: CallProgress = firstVisitProgress(makePatient({ firstVisitDate: '2026-09-17' }));
    expect(listedOn(p, '2026-09-18')).toBe(true);
    p = postponeCall(p, '2026-09-18');
    expect(listedOn(p, '2026-09-18')).toBe(false);
    expect(listedOn(p, '2026-09-19')).toBe(true);
    p = applyCallAction(p, 'answered', '2026-09-19');
    expect(listedOn(p, '2026-09-20')).toBe(false);
    expect(p.attempts).toBe(1);
  });

  it('an ignored call stays listed and gets more overdue each day', () => {
    const p = firstVisitProgress(makePatient({ firstVisitDate: '2026-09-17' }));
    expect(listedOn(p, '2026-09-22')).toBe(true);
    expect(overdueDays(p.dueDate, '2026-09-22')).toBe(4);
  });
});
