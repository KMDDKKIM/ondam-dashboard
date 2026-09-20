import { describe, expect, it } from 'vitest';
import {
  agingBadge,
  countOpen,
  findOpenDuplicates,
  matchesFilter,
  normalizeItemName,
  safeUrl,
  sortOpenOldestFirst,
  supplyStatus,
} from './supplyHelpers';

const requested = { orderedAt: null, receivedAt: null };
const ordered = { orderedAt: '2026-09-20T01:00:00Z', receivedAt: null };
const received = { orderedAt: '2026-09-20T01:00:00Z', receivedAt: '2026-09-22T01:00:00Z' };

describe('supplyStatus', () => {
  it('신청/주문/도착을 시각으로 판단한다', () => {
    expect(supplyStatus(requested)).toBe('requested');
    expect(supplyStatus(ordered)).toBe('ordered');
    expect(supplyStatus(received)).toBe('received');
  });
});

describe('matchesFilter', () => {
  it('open은 도착 전 전부, 나머지는 해당 상태만', () => {
    expect(matchesFilter(requested, 'open')).toBe(true);
    expect(matchesFilter(ordered, 'open')).toBe(true);
    expect(matchesFilter(received, 'open')).toBe(false);
    expect(matchesFilter(ordered, 'ordered')).toBe(true);
    expect(matchesFilter(ordered, 'requested')).toBe(false);
    expect(matchesFilter(received, 'all')).toBe(true);
  });
});

describe('safeUrl', () => {
  it('http(s)만 허용하고 스킴이 없으면 https를 붙인다', () => {
    expect(safeUrl('https://a.com/x')).toBe('https://a.com/x');
    expect(safeUrl('a.com/x')).toBe('https://a.com/x');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('   ')).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
});

describe('agingBadge', () => {
  const today = '2026-09-20';
  it('신청됨은 신청일 기준으로 3일 이상 노랑, 7일 이상 빨강', () => {
    expect(agingBadge('requested', '2026-09-20T01:00:00Z', null, today)).toEqual({ label: '신청 오늘', level: 'none', days: 0 });
    expect(agingBadge('requested', '2026-09-18T01:00:00Z', null, today)).toEqual({ label: '신청 2일째', level: 'none', days: 2 });
    expect(agingBadge('requested', '2026-09-17T01:00:00Z', null, today)).toEqual({ label: '신청 3일째', level: 'yellow', days: 3 });
    expect(agingBadge('requested', '2026-09-14T01:00:00Z', null, today)?.level).toBe('yellow');
    expect(agingBadge('requested', '2026-09-13T01:00:00Z', null, today)).toEqual({ label: '신청 7일째', level: 'red', days: 7 });
  });
  it('주문완료는 주문일 기준 "주문 후 N일째"', () => {
    expect(agingBadge('ordered', '2026-09-01T01:00:00Z', '2026-09-16T01:00:00Z', today)).toEqual({
      label: '주문 후 4일째',
      level: 'yellow',
      days: 4,
    });
    expect(agingBadge('ordered', '2026-09-01T01:00:00Z', '2026-09-10T01:00:00Z', today)?.level).toBe('red');
  });
  it('도착완료는 배지가 없고, 한국 날짜 경계를 따른다', () => {
    expect(agingBadge('received', '2026-09-01T01:00:00Z', '2026-09-02T01:00:00Z', today)).toBeNull();
    // 09-16 16:00Z = 한국 09-17 01:00 -> 3일째
    expect(agingBadge('requested', '2026-09-16T16:00:00Z', null, today)?.days).toBe(3);
    // 09-16 14:00Z = 한국 09-16 23:00 -> 4일째
    expect(agingBadge('requested', '2026-09-16T14:00:00Z', null, today)?.days).toBe(4);
  });
});

describe('중복 품목 감지', () => {
  it('공백·대소문자를 무시하고 정규화한다', () => {
    expect(normalizeItemName('  일회용 장갑 (M) ')).toBe('일회용장갑(m)');
    expect(normalizeItemName('A4  Paper')).toBe('a4paper');
  });
  const base = { requestedAt: '2026-09-10T00:00:00Z' };
  const open1 = { ...base, id: 'a', itemName: '일회용 장갑', orderedAt: null, receivedAt: null };
  const open2 = { ...base, id: 'b', itemName: 'A4 용지', orderedAt: '2026-09-11T00:00:00Z', receivedAt: null };
  const done = { ...base, id: 'c', itemName: '마스크', orderedAt: '2026-09-11T00:00:00Z', receivedAt: '2026-09-12T00:00:00Z' };
  const all = [open1, open2, done];
  it('진행 중(도착 전) 신청만 중복으로 본다', () => {
    expect(findOpenDuplicates('일회용장갑', all).map((r) => r.id)).toEqual(['a']);
    expect(findOpenDuplicates(' a4용지 ', all).map((r) => r.id)).toEqual(['b']);
    expect(findOpenDuplicates('마스크', all)).toEqual([]);
    expect(findOpenDuplicates('   ', all)).toEqual([]);
    expect(findOpenDuplicates('붕대', all)).toEqual([]);
  });
});

describe('진행 중 정렬과 건수', () => {
  const r = (id: string, requestedAt: string, ordered: boolean, received = false) => ({
    id,
    requestedAt,
    orderedAt: ordered ? '2026-09-15T00:00:00Z' : null,
    receivedAt: received ? '2026-09-16T00:00:00Z' : null,
  });
  it('주문 대기 먼저, 각 묶음 안에서 오래된 신청부터', () => {
    const list = [
      r('new-ordered', '2026-09-12T00:00:00Z', true),
      r('new-req', '2026-09-19T00:00:00Z', false),
      r('old-ordered', '2026-09-01T00:00:00Z', true),
      r('old-req', '2026-09-05T00:00:00Z', false),
    ];
    expect(sortOpenOldestFirst(list).map((x) => x.id)).toEqual(['old-req', 'new-req', 'old-ordered', 'new-ordered']);
    expect(list[0].id).toBe('new-ordered'); // 원본은 바뀌지 않는다
  });
  it('주문 대기/도착 대기 건수를 센다(도착완료 제외)', () => {
    const list = [
      r('1', '2026-09-01T00:00:00Z', false),
      r('2', '2026-09-02T00:00:00Z', false),
      r('3', '2026-09-03T00:00:00Z', true),
      r('4', '2026-09-04T00:00:00Z', true, true),
    ];
    expect(countOpen(list)).toEqual({ waitingOrder: 2, waitingArrival: 1 });
    expect(countOpen([])).toEqual({ waitingOrder: 0, waitingArrival: 0 });
  });
});
