import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NonCoveredPurchase } from '@/lib/types';
import {
  HappyCallSyncError,
  createNonCoveredPurchase,
  defaultHappyCallDate,
  deleteNonCoveredPurchase,
  listKnownPatients,
  listNonCoveredPurchases,
  updateNonCoveredPurchase,
} from './nonCoveredPurchases';

describe('defaultHappyCallDate', () => {
  it('한약 수령일 기본값은 구매일 다음날이다(월말·연말도 넘어간다)', () => {
    expect(defaultHappyCallDate('2026-09-19')).toBe('2026-09-20');
    expect(defaultHappyCallDate('2026-09-30')).toBe('2026-10-01');
    expect(defaultHappyCallDate('2026-12-31')).toBe('2027-01-01');
  });
});

// --- Supabase 쿼리 빌더를 흉내 내는 가짜 클라이언트 ---

interface Call {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  payload?: unknown;
  filters: [string, unknown][];
  range?: [number, number];
}
type Result = { data: unknown; error: unknown };

function fakeClient(handler: (call: Call) => Result | Promise<Result>) {
  const calls: Call[] = [];
  function builder(table: string) {
    const call: Call = { table, op: 'select', filters: [] };
    let opSet = false;
    const setOp = (op: Call['op'], payload?: unknown) => {
      if (!opSet) {
        call.op = op;
        call.payload = payload;
        opSet = true;
      }
    };
    const b: Record<string, unknown> = {
      select: () => (setOp('select'), b),
      insert: (payload: unknown) => (setOp('insert', payload), b),
      update: (payload: unknown) => (setOp('update', payload), b),
      delete: () => (setOp('delete'), b),
      eq: (column: string, value: unknown) => (call.filters.push([column, value]), b),
      in: (column: string, value: unknown) => (call.filters.push([`${column} in`, value]), b),
      order: () => b,
      range: (from: number, to: number) => ((call.range = [from, to]), b),
      single: () => b,
      then: (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => {
        calls.push(call);
        return Promise.resolve(handler(call)).then(resolve, reject);
      },
    };
    return b;
  }
  return { client: { from: builder } as unknown as SupabaseClient, calls };
}

const OK = (data: unknown = null): Result => ({ data, error: null });

function purchaseRow(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    patient_name: '홍길동',
    chart_no: '100',
    phone: null,
    category: '일반',
    product_name: '공진단',
    amount: 300000,
    purchase_date: '2026-09-20',
    memo: null,
    happy_call_date: null,
    happy_call_entry_id: null,
    happy_call_entry_id_2: null,
    happy_call_entry_id_3: null,
    duration_days: null,
    goal_category: null,
    created_by: null,
    created_at: '2026-09-20T01:00:00Z',
    ...extra,
  };
}

function purchase(extra: Partial<NonCoveredPurchase> = {}): NonCoveredPurchase {
  return {
    id: 'p1',
    patientName: '홍길동',
    chartNo: '100',
    phone: null,
    category: '일반',
    productName: '공진단',
    amount: 300000,
    purchaseDate: '2026-09-20',
    memo: null,
    happyCallDate: '2026-09-21',
    happyCallEntryId: 'e1',
    happyCallEntryId2: 'e2',
    happyCallEntryId3: 'e3',
    durationDays: 30,
    goalCategory: null,
    createdBy: null,
    createdAt: '2026-09-20T01:00:00Z',
    ...extra,
  };
}

describe('listKnownPatients', () => {
  it('차트번호별로 중복을 없앤다', () => {
    const rows = [purchase({ chartNo: '100', patientName: '홍길동' }), purchase({ chartNo: '100', patientName: '홍길동' }), purchase({ chartNo: '200', patientName: '김철수' })];
    expect(listKnownPatients(rows)).toEqual([
      { patientName: '홍길동', chartNo: '100', phone: null },
      { patientName: '김철수', chartNo: '200', phone: null },
    ]);
  });

  it('차트번호가 빈 기록은 후보에서 뺀다(일괄로 넣은 과거 이력 등)', () => {
    const rows = [purchase({ chartNo: '', patientName: '이력환자' }), purchase({ chartNo: '100', patientName: '홍길동' })];
    expect(listKnownPatients(rows)).toEqual([{ patientName: '홍길동', chartNo: '100', phone: null }]);
  });
});

describe('listNonCoveredPurchases', () => {
  it('1000건씩 이어서 끝까지 읽어 어떤 행도 빠지지 않는다', async () => {
    const total = 2500;
    const { client, calls } = fakeClient((call) => {
      const [from, to] = call.range!;
      const rows = [];
      for (let i = from; i <= Math.min(to, total - 1); i++) rows.push(purchaseRow(`id-${i}`));
      return OK(rows);
    });
    const result = await listNonCoveredPurchases(client);
    expect(result).toHaveLength(total);
    expect(new Set(result.map((r) => r.id)).size).toBe(total);
    expect(calls.map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('정확히 1000건이면 한 번 더 읽어 빈 페이지로 끝낸다', async () => {
    const { client, calls } = fakeClient((call) => {
      const [from] = call.range!;
      return OK(from === 0 ? Array.from({ length: 1000 }, (_, i) => purchaseRow(`id-${i}`)) : []);
    });
    expect(await listNonCoveredPurchases(client)).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });

  it('중간에 오류가 나면 잘린 결과 대신 throw 한다', async () => {
    const { client } = fakeClient((call) =>
      call.range![0] === 0
        ? OK(Array.from({ length: 1000 }, (_, i) => purchaseRow(`id-${i}`)))
        : { data: null, error: new Error('boom') }
    );
    await expect(listNonCoveredPurchases(client)).rejects.toThrow('boom');
  });
});

describe('createNonCoveredPurchase', () => {
  const input = {
    patientName: '홍길동',
    chartNo: '100',
    phone: null,
    category: '일반',
    productName: '공진단',
    amount: null,
    purchaseDate: '2026-09-20',
    memo: null,
    happyCallDate: '2026-09-21',
    durationDays: 30,
    goalCategory: null,
    createdBy: null,
  };

  it('구매 + 3개 콜을 만들고 연결한다', async () => {
    let entryCount = 0;
    const { client, calls } = fakeClient((call) => {
      if (call.table === 'non_covered_purchases' && call.op === 'insert') return OK(purchaseRow('p1'));
      if (call.table === 'happy_call_manual_entries' && call.op === 'insert') return OK({ id: `e${++entryCount}` });
      return OK();
    });
    const created = await createNonCoveredPurchase(client, input);
    expect(created).toMatchObject({ happyCallEntryId: 'e1', happyCallEntryId2: 'e2', happyCallEntryId3: 'e3' });
    const link = calls.find((c) => c.op === 'update')!;
    expect(link.payload).toEqual({ happy_call_entry_id: 'e1', happy_call_entry_id_2: 'e2', happy_call_entry_id_3: 'e3' });
  });

  it('콜 생성이 실패하면 구매와 이미 만든 콜을 되돌리고 오류를 낸다', async () => {
    let entryCount = 0;
    const { client, calls } = fakeClient((call) => {
      if (call.table === 'non_covered_purchases' && call.op === 'insert') return OK(purchaseRow('p1'));
      if (call.table === 'happy_call_manual_entries' && call.op === 'insert') {
        entryCount += 1;
        return entryCount === 2 ? { data: null, error: new Error('insert failed') } : OK({ id: `e${entryCount}` });
      }
      if (call.table === 'happy_call_manual_entries' && call.op === 'select') return OK([]);
      return OK();
    });
    await expect(createNonCoveredPurchase(client, input)).rejects.toBeInstanceOf(HappyCallSyncError);
    const purchaseDelete = calls.find((c) => c.table === 'non_covered_purchases' && c.op === 'delete');
    expect(purchaseDelete?.filters).toContainEqual(['id', 'p1']);
    const entryDelete = calls.find((c) => c.table === 'happy_call_manual_entries' && c.op === 'delete');
    expect(entryDelete?.filters).toContainEqual(['id in', ['e1']]);
    // 구매를 먼저 지우고 나서 콜을 지운다
    expect(calls.indexOf(purchaseDelete!)).toBeLessThan(calls.indexOf(entryDelete!));
  });

  it('수령일이 없으면 콜 없이 구매만 만든다', async () => {
    const { client, calls } = fakeClient(() => OK(purchaseRow('p1')));
    await createNonCoveredPurchase(client, { ...input, happyCallDate: null, durationDays: null });
    expect(calls.filter((c) => c.table === 'happy_call_manual_entries')).toHaveLength(0);
  });
});

describe('deleteNonCoveredPurchase', () => {
  it('구매를 지운 뒤 열려 있는 해피콜도 지운다', async () => {
    const { client, calls } = fakeClient((call) => {
      if (call.table === 'non_covered_purchases') return OK([{ id: 'p1' }]);
      if (call.op === 'select') return OK([]);
      return OK();
    });
    await deleteNonCoveredPurchase(client, purchase());
    const entryDelete = calls.find((c) => c.table === 'happy_call_manual_entries' && c.op === 'delete')!;
    expect(entryDelete.filters).toContainEqual(['id in', ['e1', 'e2', 'e3']]);
    // 이미 끝난 콜(통화 기록)은 지우지 않는다
    expect(entryDelete.filters).toContainEqual(['done', false]);
    expect(calls[0].table).toBe('non_covered_purchases');
  });

  it('DELETE 정책이 아직 없어 콜이 남으면 "취소됨"으로 닫는다', async () => {
    const { client, calls } = fakeClient((call) => {
      if (call.table === 'non_covered_purchases') return OK([{ id: 'p1' }]);
      if (call.op === 'select') return OK([{ id: 'e2' }]);
      return OK();
    });
    await deleteNonCoveredPurchase(client, purchase());
    const close = calls.find((c) => c.table === 'happy_call_manual_entries' && c.op === 'update')!;
    expect(close.payload).toMatchObject({ done: true });
    expect(close.filters).toContainEqual(['id in', ['e2']]);
    expect(close.filters).toContainEqual(['done', false]);
  });

  it('구매 행이 지워지지 않았으면(0행) 오류를 내고 콜을 건드리지 않는다', async () => {
    const { client, calls } = fakeClient(() => OK([]));
    await expect(deleteNonCoveredPurchase(client, purchase())).rejects.toThrow();
    expect(calls.filter((c) => c.table === 'happy_call_manual_entries')).toHaveLength(0);
  });
});

describe('updateNonCoveredPurchase', () => {
  const patch = {
    patientName: '홍길동',
    chartNo: '100',
    phone: null,
    category: '일반',
    productName: '공진단',
    amount: 300000,
    purchaseDate: '2026-09-20',
    memo: null,
    goalCategory: null,
    happyCallDate: '2026-09-25',
    durationDays: 30,
  };

  it('수령일을 바꾸면 끝난 콜은 두고 열린 콜만 옮긴다', async () => {
    const { client, calls } = fakeClient((call) => {
      if (call.table === 'happy_call_manual_entries' && call.op === 'select') {
        return OK([
          { id: 'e1', call_date: '2026-09-22', note: '공진단 수령 후속 1차', done: true, attempts: 1 },
          { id: 'e2', call_date: '2026-10-06', note: '공진단 수령 후속 2차', done: false, attempts: 0 },
          { id: 'e3', call_date: '2026-10-18', note: '공진단 수령 후속 3차(종료 임박)', done: false, attempts: 0 },
        ]);
      }
      return OK([{ id: 'x' }]);
    });
    await updateNonCoveredPurchase(client, purchase(), patch);
    const entryUpdates = calls.filter((c) => c.table === 'happy_call_manual_entries' && c.op === 'update');
    expect(entryUpdates.map((c) => c.filters.find(([k]) => k === 'id')?.[1])).toEqual(['e2', 'e3']);
    expect(entryUpdates[0].payload).toEqual({ call_date: '2026-10-05', note: '공진단 중간상담' });
    expect(entryUpdates[0].filters).toContainEqual(['done', false]);
    expect(entryUpdates[0].filters).toContainEqual(['attempts', 0]);
    const purchaseUpdate = calls.find((c) => c.table === 'non_covered_purchases' && c.op === 'update')!;
    expect(purchaseUpdate.payload).toMatchObject({ happy_call_date: '2026-09-25', duration_days: 30 });
  });

  it('환자 이름을 고치면 연결된 열린 콜의 이름도 바꾸고, 끝난 콜은 건드리지 않는다', async () => {
    const { client, calls } = fakeClient((call) => {
      if (call.table === 'happy_call_manual_entries' && call.op === 'select') {
        return OK([
          { id: 'e1', call_date: '2026-09-22', note: '공진단 수령 후속 1차', done: true, attempts: 1 },
          { id: 'e2', call_date: '2026-10-06', note: '공진단 수령 후속 2차', done: false, attempts: 0 },
          { id: 'e3', call_date: '2026-10-18', note: '공진단 수령 후속 3차(종료 임박)', done: false, attempts: 0 },
        ]);
      }
      return OK([{ id: 'x' }]);
    });
    await updateNonCoveredPurchase(client, purchase({ happyCallDate: '2026-09-25' }), { ...patch, patientName: '홍길순' });
    const purchaseUpdate = calls.find((c) => c.table === 'non_covered_purchases' && c.op === 'update')!;
    expect(purchaseUpdate.payload).toMatchObject({ patient_name: '홍길순' });
    const rename = calls.find(
      (c) => c.table === 'happy_call_manual_entries' && c.op === 'update' && (c.payload as { patient_name?: string }).patient_name
    )!;
    expect(rename.payload).toEqual({ patient_name: '홍길순' });
    // 끝난 콜도 id 목록에는 들어가지만 done=false 조건으로 걸러진다(통화 기록의 이름은 그대로)
    expect(rename.filters).toContainEqual(['done', false]);
    expect(rename.filters).toContainEqual(['id in', ['e1', 'e2', 'e3']]);
  });

  it('환자 이름이 그대로면 콜 이름을 다시 쓰지 않는다', async () => {
    const { client, calls } = fakeClient((call) => {
      if (call.table === 'happy_call_manual_entries' && call.op === 'select') {
        return OK([{ id: 'e1', call_date: '2026-09-22', note: '공진단 수령 후속 1차', done: false, attempts: 0 }]);
      }
      return OK([{ id: 'x' }]);
    });
    await updateNonCoveredPurchase(client, purchase({ happyCallEntryId2: null, happyCallEntryId3: null }), {
      ...patch,
      happyCallDate: '2026-09-21',
      durationDays: null,
    });
    expect(
      calls.some((c) => c.op === 'update' && c.table === 'happy_call_manual_entries' && 'patient_name' in (c.payload as object))
    ).toBe(false);
  });

  it('처방일수를 지우면 열린 2·3차 콜을 지우고 연결을 비운다', async () => {
    const { client, calls } = fakeClient((call) => {
      if (call.table === 'happy_call_manual_entries' && call.op === 'select') {
        // 지운 뒤 확인용 조회(done 조건 포함)는 비어 있다
        if (call.filters.some(([k]) => k === 'done')) return OK([]);
        return OK([
          { id: 'e1', call_date: '2026-09-22', note: '공진단 수령 후속 1차', done: false, attempts: 0 },
          { id: 'e2', call_date: '2026-10-06', note: '공진단 수령 후속 2차', done: false, attempts: 0 },
          { id: 'e3', call_date: '2026-10-18', note: '공진단 수령 후속 3차(종료 임박)', done: false, attempts: 0 },
        ]);
      }
      return OK([{ id: 'x' }]);
    });
    await updateNonCoveredPurchase(client, purchase(), { ...patch, happyCallDate: '2026-09-21', durationDays: null });
    const purchaseUpdate = calls.find((c) => c.table === 'non_covered_purchases' && c.op === 'update')!;
    expect(purchaseUpdate.payload).toMatchObject({
      happy_call_entry_id: 'e1',
      happy_call_entry_id_2: null,
      happy_call_entry_id_3: null,
    });
    const entryDelete = calls.find((c) => c.table === 'happy_call_manual_entries' && c.op === 'delete')!;
    expect(entryDelete.filters).toContainEqual(['id in', ['e2', 'e3']]);
    // 구매 연결을 먼저 비운 뒤 콜을 지운다
    expect(calls.indexOf(purchaseUpdate)).toBeLessThan(calls.indexOf(entryDelete));
  });
});
