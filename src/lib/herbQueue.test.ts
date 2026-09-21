import { describe, expect, it } from 'vitest';
import { formatQueueTime, missingFields, sortDone, sortWaiting, type HerbQueueItem } from './herbQueue';

function item(o: Partial<HerbQueueItem>): HerbQueueItem {
  return { id: 'a', patientName: '가상환자', chartNo: '', doctorName: '김동규', herbDesc: '일반한약 15일', note: '', status: 'waiting', requestedByName: '', createdAt: '2026-09-21T01:00:00Z', doneByName: '', doneAt: null, ...o };
}

describe('missingFields', () => {
  it('환자 성함·주치의·한약/횟차가 필요하고 차트번호·전달사항은 비어도 된다', () => {
    expect(missingFields({ patientName: '가상', chartNo: '', doctorName: '김동규', herbDesc: '일반한약 15일', note: '' })).toEqual([]);
    expect(missingFields({ patientName: ' ', chartNo: '', doctorName: '', herbDesc: '', note: '' })).toEqual(['환자 성함', '주치의', '한약/횟차']);
  });
});

describe('정렬', () => {
  it('대기는 먼저 신청한 순, 완료는 최근 완료한 순', () => {
    const waiting = sortWaiting([item({ id: 'b', createdAt: '2026-09-21T03:00:00Z' }), item({ id: 'a', createdAt: '2026-09-21T02:00:00Z' })]);
    expect(waiting.map((i) => i.id)).toEqual(['a', 'b']);
    const done = sortDone([item({ id: 'x', doneAt: '2026-09-21T05:00:00Z' }), item({ id: 'y', doneAt: '2026-09-21T06:00:00Z' })]);
    expect(done.map((i) => i.id)).toEqual(['y', 'x']);
  });
});

describe('formatQueueTime', () => {
  it('한국 시간으로 "월/일 시:분"', () => {
    expect(formatQueueTime('2026-09-21T05:05:00Z')).toBe('9/21 14:05');
    expect(formatQueueTime('2026-12-31T16:00:00Z')).toBe('1/1 01:00');
    expect(formatQueueTime(null)).toBe('');
  });
});
