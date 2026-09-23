import { describe, expect, it } from 'vitest';
import { callsRow, firstVisitRow, herbStockRow, reservationRow, sortTodayRows, type TodayRow, type TodayRowState } from './todayChecks';

describe('reservationRow', () => {
  it('저장된 명단이 있으면 인원을 안내로 보여 준다(할 일 아님)', () => {
    const r = reservationRow(18);
    expect(r.text).toBe('오늘 예약 18명');
    expect(r.state).toBe('info');
    expect(r.href).toBe('/reservations');
  });
  it('명단이 없으면 붙여넣기 화면으로 안내하되 급한 일은 아니다', () => {
    const r = reservationRow(0);
    expect(r.text).toBe('오늘 예약 명단이 아직 없어요');
    expect(r.state).toBe('info');
    expect(r.href).toBe('/paste-import');
  });
  it('조회 실패는 -', () => {
    expect(reservationRow(null)).toMatchObject({ text: '오늘 예약 -', state: 'unknown' });
  });
});

describe('firstVisitRow', () => {
  it('비교할 기준이 없으면 감춘다', () => {
    expect(firstVisitRow({ comparable: false })).toBeNull();
    expect(firstVisitRow(undefined)).toBeNull();
  });
  it('누락이 있으면 빨간 항목', () => {
    const r = firstVisitRow({ comparable: true, expected: 3, registered: 1, missing: 2 });
    expect(r).toMatchObject({ text: '초진·재초진 등록 누락 2명', state: 'todo', href: '/happy-call-register' });
  });
  it('누락이 없으면 정상', () => {
    expect(firstVisitRow({ comparable: true, expected: 1, registered: 1, missing: 0 })?.state).toBe('ok');
  });
  it('조회 실패는 -', () => {
    expect(firstVisitRow(null)).toMatchObject({ state: 'unknown' });
  });
});

describe('callsRow', () => {
  it('연체가 있으면 빨간색', () => {
    expect(callsRow({ open: 5, overdue: 2 })).toMatchObject({ state: 'todo', href: '/happy-call-list' });
  });
  it('연체가 없으면 빨갛지 않게', () => {
    expect(callsRow({ open: 5, overdue: 0 })).toMatchObject({ text: '오늘 걸 해피콜 5건', state: 'info' });
  });
  it('없으면 정상, 실패는 -', () => {
    expect(callsRow({ open: 0, overdue: 0 })?.state).toBe('ok');
    expect(callsRow(null)).toMatchObject({ text: '오늘 걸 해피콜 -', state: 'unknown' });
  });
});

describe('sortTodayRows', () => {
  const row = (key: string, state: TodayRowState): TodayRow => ({ key, icon: '', text: key, state, badge: '', href: '' });

  it('할 일을 맨 위로, 정상을 맨 아래로 옮긴다', () => {
    const rows = [row('a', 'ok'), row('b', 'todo'), row('c', 'info'), row('d', 'unknown')];
    expect(sortTodayRows(rows).map((r) => r.key)).toEqual(['b', 'd', 'c', 'a']);
  });
  it('같은 상태끼리는 원래 순서를 지킨다(안정 정렬)', () => {
    const rows = [row('a', 'ok'), row('b', 'todo'), row('c', 'ok'), row('d', 'todo')];
    expect(sortTodayRows(rows).map((r) => r.key)).toEqual(['b', 'd', 'a', 'c']);
  });
  it('원본 배열을 바꾸지 않는다', () => {
    const rows = [row('a', 'ok'), row('b', 'todo')];
    sortTodayRows(rows);
    expect(rows.map((r) => r.key)).toEqual(['a', 'b']);
  });
});

describe('herbStockRow', () => {
  it('등록된 약재가 없으면 정상이라고 하지 않는다', () => {
    const r = herbStockRow(0, 0);
    expect(r.text).toBe('등록된 약재가 없어요');
    expect(r.state).toBe('info');
    expect(r.href).toBe('/herb-inventory');
  });
  it('약재가 있고 재고 0이 없으면 정상', () => {
    expect(herbStockRow(0, 12).state).toBe('ok');
  });
  it('전체 수를 모르면 예전처럼 정상', () => {
    expect(herbStockRow(0, null).state).toBe('ok');
  });
  it('재고 0이 있으면 확인하기, 실패는 확인 불가', () => {
    expect(herbStockRow(3, 12)).toMatchObject({ text: '재고가 0인 약재 3개', state: 'todo' });
    expect(herbStockRow(null, 12).state).toBe('unknown');
  });
});
