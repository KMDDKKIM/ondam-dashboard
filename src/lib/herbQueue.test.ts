import { describe, expect, it } from 'vitest';
import { formatQueueTime, missingFields, pickQueueItemsToComplete, resolveHerbQueueDoctorFilter, sortDone, sortWaiting, type HerbQueueItem } from './herbQueue';

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

describe('resolveHerbQueueDoctorFilter', () => {
  it('로그인한 사람이 진료의 목록에 있으면 그 이름으로 거른다', () => {
    expect(resolveHerbQueueDoctorFilter('김동규', ['김동규', '박소은'])).toBe('김동규');
    expect(resolveHerbQueueDoctorFilter('박소은', ['김동규', '박소은'])).toBe('박소은');
  });

  it('진료의가 아니면(데스크 직원) 거르지 않는다(전체를 본다)', () => {
    expect(resolveHerbQueueDoctorFilter('정지민', ['김동규', '박소은'])).toBeNull();
    expect(resolveHerbQueueDoctorFilter(null, ['김동규', '박소은'])).toBeNull();
  });
});

describe('pickQueueItemsToComplete', () => {
  it('대기방에서 넘어온 신청 번호가 있으면 그 신청', () => {
    const waiting = [item({ id: 'a', patientName: '가상환자' }), item({ id: 'b', patientName: '가상환자' })];
    expect(pickQueueItemsToComplete(waiting, { queueId: 'b', patientName: '가상환자', chartNo: '' }).map((i) => i.id)).toEqual(['b']);
  });

  it('신청 번호가 있어도 처방전의 환자 이름이 다르면 그 신청이 아니다', () => {
    const waiting = [item({ id: 'a', patientName: '가상환자' })];
    expect(pickQueueItemsToComplete(waiting, { queueId: 'a', patientName: '다른환자', chartNo: '' })).toEqual([]);
  });

  it('번호가 없으면 같은 이름의 대기 신청이 하나일 때만', () => {
    const waiting = [item({ id: 'a', patientName: '가상환자' }), item({ id: 'b', patientName: '다른환자' })];
    expect(pickQueueItemsToComplete(waiting, { patientName: ' 가상환자 ', chartNo: '' }).map((i) => i.id)).toEqual(['a']);
  });

  it('같은 이름의 대기 신청이 여럿이면 누구 것인지 몰라 아무것도 고르지 않는다', () => {
    const waiting = [item({ id: 'a' }), item({ id: 'b' })];
    expect(pickQueueItemsToComplete(waiting, { patientName: '가상환자', chartNo: '' })).toEqual([]);
  });

  it('차트번호가 둘 다 있는데 다르면 다른 사람이다', () => {
    const waiting = [item({ id: 'a', chartNo: '1001' })];
    expect(pickQueueItemsToComplete(waiting, { patientName: '가상환자', chartNo: '2002' })).toEqual([]);
    expect(pickQueueItemsToComplete(waiting, { patientName: '가상환자', chartNo: '1001' }).map((i) => i.id)).toEqual(['a']);
  });

  it('신청에 차트번호가 없으면 이름만으로, 처방전에 차트번호가 없어도 이름만으로 맞춘다', () => {
    expect(pickQueueItemsToComplete([item({ id: 'a', chartNo: '' })], { patientName: '가상환자', chartNo: '1001' }).map((i) => i.id)).toEqual(['a']);
    expect(pickQueueItemsToComplete([item({ id: 'a', chartNo: '1001' })], { patientName: '가상환자', chartNo: '' }).map((i) => i.id)).toEqual(['a']);
  });

  it('이미 완료된 신청이나 이름이 없는 처방전은 고르지 않는다', () => {
    expect(pickQueueItemsToComplete([item({ id: 'a', status: 'done' })], { queueId: 'a', patientName: '가상환자', chartNo: '' })).toEqual([]);
    expect(pickQueueItemsToComplete([item({ id: 'a' })], { patientName: ' ', chartNo: '' })).toEqual([]);
  });
});

