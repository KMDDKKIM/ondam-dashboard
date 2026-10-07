import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordFirstVisitCallFromLog, undoCallResult } from './happyCallWorklist';
import type { HappyCallPatient } from '@/lib/types';
import type { WorklistItem } from '@/lib/happyCallQueue';

// 가짜 DB — update 요청(표·바꾼 값·조건)만 기록하고, 조건에 맞는 행이 있는 것처럼(또는 없는 것처럼) 돌려준다.
interface Op {
  table: string;
  patch: Record<string, unknown>;
  filters: [string, string, unknown][];
}

function fakeDb(rowsAffected = 1) {
  const ops: Op[] = [];
  const client = {
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          const op: Op = { table, patch, filters: [] };
          ops.push(op);
          const builder = {
            eq(col: string, val: unknown) {
              op.filters.push(['eq', col, val]);
              return builder;
            },
            is(col: string, val: unknown) {
              op.filters.push(['is', col, val]);
              return builder;
            },
            in(col: string, val: unknown) {
              op.filters.push(['in', col, val]);
              return builder;
            },
            select() {
              return Promise.resolve({ data: Array.from({ length: rowsAffected }, () => ({ id: 'x' })), error: null });
            },
            then(resolve: (v: unknown) => unknown) {
              return Promise.resolve({ data: null, error: null }).then(resolve);
            },
          };
          return builder;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, ops };
}

// 이름·번호는 모두 시험용 가짜 값이다.
function patient(o: Partial<HappyCallPatient> = {}): HappyCallPatient {
  return {
    id: 'p1', patientName: '가나다', doctorStaffId: null, patientType: '건보', acupunctureSuccess: null,
    firstVisitDate: '2026-10-06', revisit1: null, revisit2: null, jaboHerb1: null, jaboHerb2: null, jaboHerb3: null,
    nextVisitNote: null, callLog: null, memo: null, createdBy: null, createdAt: '2026-10-06T00:00:00Z',
    callDueDate: null, callOriginalDue: null, callAttempts: 0, callResult: null, ...o,
  };
}

const TODAY = '2026-10-07';
const resultOps = (ops: Op[]) => ops.filter((o) => 'call_result' in o.patch);

describe('recordFirstVisitCallFromLog — 표의 통화내역에 적었을 때', () => {
  it('"부재"를 처음 적으면 부재중으로 기록하고 내일(10/8) 다시 걸 콜로 남긴다', async () => {
    const { client, ops } = fakeDb();
    const ok = await recordFirstVisitCallFromLog(client, patient(), '10/7 부재', 'staff1', TODAY);
    expect(ok).toBe(true);
    const [op] = resultOps(ops);
    expect(op.patch).toMatchObject({ call_result: 'no_answer', call_attempts: 1, call_due_date: '2026-10-08', call_original_due: '2026-10-07', call_memo: '10/7 부재', call_completed_by: 'staff1' });
  });

  it('통화 내용을 적으면 통화완료로 닫는다', async () => {
    const { client, ops } = fakeDb();
    expect(await recordFirstVisitCallFromLog(client, patient(), '치료 받고 괜찮으셨대요', 'staff1', TODAY)).toBe(true);
    expect(resultOps(ops)[0].patch).toMatchObject({ call_result: 'answered', call_attempts: 1 });
  });

  it('부재 뒤에 "10/8 통화완료"를 덧붙이면 통화완료로 닫는다', async () => {
    const { client, ops } = fakeDb();
    const p = patient({ callLog: '10/7 부재', callResult: 'no_answer', callAttempts: 1, callDueDate: '2026-10-08', callOriginalDue: '2026-10-07' });
    expect(await recordFirstVisitCallFromLog(client, p, '10/7 부재 10/8 통화완료 잘 지내심', 'staff1', '2026-10-08')).toBe(true);
    expect(resultOps(ops)[0].patch).toMatchObject({ call_result: 'answered', call_attempts: 2 });
  });

  it('부재 뒤에 또 "부재"를 덧붙이면 연락 안 됨으로 끝낸다', async () => {
    const { client, ops } = fakeDb();
    const p = patient({ callLog: '10/7 부재', callResult: 'no_answer', callAttempts: 1, callDueDate: '2026-10-08', callOriginalDue: '2026-10-07' });
    expect(await recordFirstVisitCallFromLog(client, p, '10/7 부재 10/8 부재', 'staff1', '2026-10-08')).toBe(true);
    expect(resultOps(ops)[0].patch).toMatchObject({ call_result: 'unreachable', call_attempts: 2 });
  });

  it('앞부분을 고친 경우(오타 수정)는 기록하지 않는다', async () => {
    const { client, ops } = fakeDb();
    const p = patient({ callLog: '10/7 부재', callResult: 'no_answer', callAttempts: 1, callDueDate: '2026-10-08' });
    expect(await recordFirstVisitCallFromLog(client, p, '10/7 부재함', 'staff1', TODAY)).toBe(false);
    expect(await recordFirstVisitCallFromLog(client, p, '10/6 부재', 'staff1', TODAY)).toBe(false);
    expect(ops).toEqual([]);
  });

  it('이 기능 전에 글만 적어 둔 옛 행(결과 없음)에 글을 덧붙여도 건드리지 않는다', async () => {
    const { client, ops } = fakeDb();
    const p = patient({ callLog: '치료 받고 좋으셨대요', callResult: null });
    expect(await recordFirstVisitCallFromLog(client, p, '치료 받고 좋으셨대요 10/9 내원 예정', 'staff1', TODAY)).toBe(false);
    expect(ops).toEqual([]);
  });

  it('이미 닫힌 콜은 건드리지 않는다', async () => {
    const { client, ops } = fakeDb();
    const p = patient({ callLog: '통화완료', callResult: 'answered', callAttempts: 1 });
    expect(await recordFirstVisitCallFromLog(client, p, '통화완료 추가 메모 부재', 'staff1', TODAY)).toBe(false);
    expect(ops).toEqual([]);
  });

  it('다른 직원이 먼저 처리해서 상태가 바뀌었으면 조용히 건너뛴다', async () => {
    const { client } = fakeDb(0);
    expect(await recordFirstVisitCallFromLog(client, patient(), '10/7 부재', 'staff1', TODAY)).toBe(false);
  });

  it('빈 글은 기록하지 않는다', async () => {
    const { client, ops } = fakeDb();
    expect(await recordFirstVisitCallFromLog(client, patient(), '   ', 'staff1', TODAY)).toBe(false);
    expect(ops).toEqual([]);
  });
});

describe('undoCallResult — 표에 적은 글로 기록된 콜을 되돌릴 때', () => {
  const item = (o: Partial<WorklistItem> = {}): WorklistItem => ({
    key: 'firstVisit-p1', kind: 'firstVisit', id: 'p1', patientName: '가나다', phone: null, doctorStaffId: null,
    dueDate: '2026-10-07', originalDue: null, attempts: 1, result: 'answered', closed: true, memo: '치료 받고 괜찮으셨대요',
    note: null, callType: null, completedBy: 'staff1', completedAt: '2026-10-07T01:00:00Z', ...o,
  });

  it('처음 기록한 콜을 되돌리면 표에 적은 글을 비워 다시 "통화 완료"로 닫히지 않게 한다(글은 메모에 남는다)', async () => {
    const { client, ops } = fakeDb();
    await undoCallResult(client, item(), TODAY);
    const clear = ops.find((o) => 'call_log' in o.patch);
    expect(clear?.patch).toEqual({ call_log: null });
    expect(clear?.filters).toContainEqual(['in', 'call_log', ['통화완료: 치료 받고 괜찮으셨대요', '치료 받고 괜찮으셨대요']]);
  });

  it('두 번째 결과를 되돌릴 때는(아직 첫 부재 기록이 남음) 표의 글 전체를 지우지 않는다', async () => {
    const { client, ops } = fakeDb();
    await undoCallResult(client, item({ attempts: 2, result: 'unreachable', memo: '10/7 부재 10/8 부재' }), '2026-10-08');
    const clear = ops.find((o) => 'call_log' in o.patch);
    expect(clear?.filters).toContainEqual(['in', 'call_log', ['연락 안 됨: 10/7 부재 10/8 부재']]);
  });
});
