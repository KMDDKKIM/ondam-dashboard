import { describe, expect, it } from 'vitest';
import { applyGrowthMateStatuses, mapGrowthMateStatus, type GrowthMateReservation } from './growthMateSync';
import type { Reservation } from './reservations/types';

function ours(patientName: string, visitStatus = ''): Reservation {
  return {
    doctorName: '',
    timeLabel: '09:00',
    patientName,
    chartNo: '',
    phone: '',
    mobile: '',
    visitStatus,
    treatmentArea: '',
    treatment: '',
    specialNotes: '',
    memo: '',
  };
}

function theirs(patientName: string, visitStatus: string): GrowthMateReservation {
  return { patientName, visitStatus };
}

describe('mapGrowthMateStatus', () => {
  it('확정된 상태만 우리 값으로 바꾼다', () => {
    expect(mapGrowthMateStatus('내원완료')).toBe('정상이행');
    expect(mapGrowthMateStatus('예약부도')).toBe('노쇼');
    expect(mapGrowthMateStatus('예약취소')).toBe('취소');
  });
  it('아직 방문 전(확정 안 됨)이면 null — 손대지 않는다', () => {
    expect(mapGrowthMateStatus('내원예정')).toBeNull();
    expect(mapGrowthMateStatus('내원예정(변경)')).toBeNull();
    expect(mapGrowthMateStatus('그밖에모르는값')).toBeNull();
  });
});

describe('applyGrowthMateStatuses', () => {
  it('이름이 맞으면 상태를 채운다', () => {
    const r = applyGrowthMateStatuses([ours('홍길동')], [theirs('홍길동', '내원완료')]);
    expect(r.updated[0].visitStatus).toBe('정상이행');
    expect(r.changedCount).toBe(1);
    expect(r.unmatchedNames).toEqual([]);
  });

  it('내원예정처럼 확정 안 된 상태는 건드리지 않는다', () => {
    const r = applyGrowthMateStatuses([ours('홍길동', '')], [theirs('홍길동', '내원예정')]);
    expect(r.updated[0].visitStatus).toBe('');
    expect(r.changedCount).toBe(0);
  });

  it('이미 같은 값이면 changedCount에 안 낀다(그래도 줄 자체는 그대로 반환)', () => {
    const r = applyGrowthMateStatuses([ours('홍길동', '정상이행')], [theirs('홍길동', '내원완료')]);
    expect(r.updated[0].visitStatus).toBe('정상이행');
    expect(r.changedCount).toBe(0);
  });

  it('핀셋포인트가 더 정확하다고 보고 우리 쪽 기존 표시도 덮어쓴다', () => {
    const r = applyGrowthMateStatuses([ours('홍길동', '노쇼')], [theirs('홍길동', '내원완료')]);
    expect(r.updated[0].visitStatus).toBe('정상이행');
    expect(r.changedCount).toBe(1);
  });

  it('우리 명단에 없는 이름은 unmatchedNames로 안내한다', () => {
    const r = applyGrowthMateStatuses([ours('홍길동')], [theirs('성춘향', '예약부도')]);
    expect(r.updated[0].visitStatus).toBe('');
    expect(r.unmatchedNames).toEqual(['성춘향']);
  });

  it('동명이인·중복 예약은 멀티셋으로 하나씩만 매칭한다', () => {
    const r = applyGrowthMateStatuses(
      [ours('홍길동'), ours('홍길동')],
      [theirs('홍길동', '내원완료'), theirs('홍길동', '예약부도')]
    );
    expect(r.updated.map((x) => x.visitStatus)).toEqual(['정상이행', '노쇼']);
    expect(r.changedCount).toBe(2);
    expect(r.unmatchedNames).toEqual([]);
  });

  it('핀셋포인트 쪽 이름이 우리보다 많으면 남는 만큼만 안내한다', () => {
    const r = applyGrowthMateStatuses(
      [ours('홍길동')],
      [theirs('홍길동', '내원완료'), theirs('홍길동', '예약부도')]
    );
    expect(r.updated[0].visitStatus).toBe('정상이행');
    expect(r.unmatchedNames).toEqual(['홍길동']);
  });

  it('이름 공백 차이는 무시하고 매칭한다', () => {
    const r = applyGrowthMateStatuses([ours('홍 길동')], [theirs('홍길동', '내원완료')]);
    expect(r.updated[0].visitStatus).toBe('정상이행');
  });

  it('빈 목록이면 아무 것도 안 바뀐다', () => {
    expect(applyGrowthMateStatuses([], [])).toEqual({ updated: [], changedCount: 0, unmatchedNames: [] });
  });
});
