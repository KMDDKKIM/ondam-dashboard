import { describe, expect, it } from 'vitest';
import { mergeReservationPaste } from './reservationPasteMerge';
import type { ParsedReservationRow } from './pasteImport';

function row(patch: Partial<ParsedReservationRow>): ParsedReservationRow {
  return {
    doctorName: '김동규',
    timeLabel: '10:00',
    patientName: '홍길동',
    chartNo: '1001',
    phone: '',
    mobile: '',
    visitStatus: '내원',
    treatmentArea: '',
    treatment: '',
    specialNotes: '',
    memo: '',
    ...patch,
  };
}

describe('mergeReservationPaste', () => {
  it('keeps the desk-marked result (정상이행/노쇼) when the same patient (by chart no) is re-pasted', () => {
    const existing = [{ patientName: '홍길동', chartNo: '1001', visitStatus: '정상이행', specialNotes: '', memo: '' }];
    const incoming = [row({ visitStatus: '내원' })];
    expect(mergeReservationPaste(existing, incoming)[0].visitStatus).toBe('정상이행');
  });

  it('matches by name when chart no is missing on either side', () => {
    const existing = [{ patientName: '홍길동', chartNo: '', visitStatus: '노쇼', specialNotes: '', memo: '' }];
    const incoming = [row({ chartNo: '', visitStatus: '내원' })];
    expect(mergeReservationPaste(existing, incoming)[0].visitStatus).toBe('노쇼');
  });

  it('does not carry over a plain 내원/취소/blank status — the fresh paste value wins', () => {
    const existing = [{ patientName: '홍길동', chartNo: '1001', visitStatus: '내원', specialNotes: '', memo: '' }];
    const incoming = [row({ visitStatus: '취소' })];
    expect(mergeReservationPaste(existing, incoming)[0].visitStatus).toBe('취소');
  });

  it('keeps hand-typed 특이사항/비고 (paste never supplies 특이사항 and may carry a stale 비고)', () => {
    const existing = [{ patientName: '홍길동', chartNo: '1001', visitStatus: '', specialNotes: '지난주 낙상', memo: '주차 안내함' }];
    const incoming = [row({ specialNotes: '', memo: '예약메모 원본' })];
    const merged = mergeReservationPaste(existing, incoming)[0];
    expect(merged.specialNotes).toBe('지난주 낙상');
    expect(merged.memo).toBe('주차 안내함');
  });

  it('uses the new memo when the existing one is empty', () => {
    const existing = [{ patientName: '홍길동', chartNo: '1001', visitStatus: '', specialNotes: '', memo: '' }];
    const incoming = [row({ memo: '새 예약메모' })];
    expect(mergeReservationPaste(existing, incoming)[0].memo).toBe('새 예약메모');
  });

  it('leaves an unmatched new row untouched (new patient, not in the old list)', () => {
    const existing = [{ patientName: '김철수', chartNo: '2002', visitStatus: '정상이행', specialNotes: '', memo: '' }];
    const incoming = [row({ patientName: '홍길동', chartNo: '1001', visitStatus: '내원' })];
    expect(mergeReservationPaste(existing, incoming)[0].visitStatus).toBe('내원');
  });

  it('matches same-name duplicates in order (동명이인/중복 예약), one to one', () => {
    const existing = [
      { patientName: '홍길동', chartNo: '', visitStatus: '정상이행', specialNotes: '', memo: '' },
      { patientName: '홍길동', chartNo: '', visitStatus: '노쇼', specialNotes: '', memo: '' },
    ];
    const incoming = [
      row({ chartNo: '', timeLabel: '09:00', visitStatus: '내원' }),
      row({ chartNo: '', timeLabel: '15:00', visitStatus: '내원' }),
    ];
    const merged = mergeReservationPaste(existing, incoming);
    expect(merged[0].visitStatus).toBe('정상이행');
    expect(merged[1].visitStatus).toBe('노쇼');
  });

  it('prefers matching by chart no over name when both are given', () => {
    // 같은 차트번호를 쓰는 다른 이름 표기(개명 등)는 차트번호로 잡아 결과를 옮긴다.
    const existing = [{ patientName: '홍길동(개명전)', chartNo: '1001', visitStatus: '정상이행', specialNotes: '', memo: '' }];
    const incoming = [row({ patientName: '홍길동', chartNo: '1001' })];
    expect(mergeReservationPaste(existing, incoming)[0].visitStatus).toBe('정상이행');
  });
});
