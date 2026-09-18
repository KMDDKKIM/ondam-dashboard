import { describe, expect, it } from 'vitest';
import { analyzePasteText, computeReservationDerivedStats } from './pasteImport';

const RESERVATION_HEADER = [
  'No',
  '■',
  '내원',
  '취소',
  '예약일자',
  '예약시각',
  '환자명',
  '차트번호',
  '핸드폰',
  '전화',
  '진료의',
  '진료구분',
  '진료항목',
  '진료패키지',
  '예약메모',
  '수정일자',
].join('\t');

describe('analyzePasteText - reservation sheet', () => {
  it('parses a single-day reservation sheet grouped by date', () => {
    const text = [
      RESERVATION_HEADER,
      ['1', '', '내원', '', '2026-09-18', '19:00', '전명옥', '006191', '010-9201-5405', '', '김동규', '통원', '침부항', '', '', '2026-09-15'].join('\t'),
      ['2', '', '', '', '2026-09-18', '18:20', '우희숙', '004695', '010-5173-1609', '', '박소은', '통원', 'U+비급여 추나', '', '', '2026-09-15'].join('\t'),
    ].join('\n');

    const result = analyzePasteText(text);
    expect(result.format).toBe('reservation');
    if (result.format !== 'reservation') throw new Error('unreachable');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].date).toBe('2026-09-18');
    expect(result.groups[0].rows).toHaveLength(2);
    expect(result.groups[0].rows[0]).toMatchObject({
      patientName: '전명옥',
      chartNo: '006191',
      doctorName: '김동규',
      timeLabel: '19:00',
      treatmentArea: '통원',
      treatment: '침부항',
    });
  });

  it('groups rows by distinct dates when the paste spans multiple days', () => {
    const text = [
      RESERVATION_HEADER,
      ['1', '', '내원', '', '2026-09-18', '19:00', '전명옥', '006191', '', '', '김동규', '통원', '침부항', '', '', ''].join('\t'),
      ['2', '', '', '', '2026-09-19', '10:00', '우희숙', '004695', '', '', '박소은', '통원', '침', '', '', ''].join('\t'),
    ].join('\n');

    const result = analyzePasteText(text);
    expect(result.format).toBe('reservation');
    if (result.format !== 'reservation') throw new Error('unreachable');
    expect(result.groups.map((g) => g.date)).toEqual(['2026-09-18', '2026-09-19']);
  });

  it('prefers 취소 over 내원 for visitStatus', () => {
    const text = [
      RESERVATION_HEADER,
      ['1', '', '내원', '취소', '2026-09-18', '10:30', '문명환', '', '', '', '김동규', '초진', '', '', '', ''].join('\t'),
    ].join('\n');
    const result = analyzePasteText(text);
    if (result.format !== 'reservation') throw new Error('unreachable');
    expect(result.groups[0].rows[0].visitStatus).toBe('취소');
  });
});

describe('computeReservationDerivedStats', () => {
  it('counts visited vs cancelled rows and flags 추나 mentions', () => {
    const text = [
      RESERVATION_HEADER,
      ['1', '', '내원', '', '2026-09-18', '19:00', 'A', '', '', '', '', '통원', '침부항', '', '', ''].join('\t'),
      ['2', '', '', '취소', '2026-09-18', '18:20', 'B', '', '', '', '', '통원', 'U+비급여 추나', '', '', ''].join('\t'),
      ['3', '', '내원', '', '2026-09-18', '10:00', 'C', '', '', '', '', '추나', '봉침', '', '', ''].join('\t'),
    ].join('\n');
    const result = analyzePasteText(text);
    if (result.format !== 'reservation') throw new Error('unreachable');
    const stats = computeReservationDerivedStats(result.groups[0].rows);
    expect(stats).toEqual({
      visitCount: 2,
      reservationCount: 3,
      excludedCount: 1,
      excludedNames: ['B'],
      chunaCount: 2,
      chunaNames: ['B', 'C'],
    });
  });
});

const SETTLEMENT_HEADER = ['내원환자수', '신규환자수', '자보환자수', '총진료비', '본인부담', '보험(청구)', '자보(청구)', '산재(청구)', '비급여', '환자부담계', '미수금'].join(
  '\t'
);

describe('analyzePasteText - daily settlement', () => {
  it('reads 총진료비 as revenue and the date from 진료날짜', () => {
    const text = [
      '일일 결산표',
      '진료날짜:2026-09-18',
      SETTLEMENT_HEADER,
      ['16', '1', '0', '814000', '200900', '451100', '0', '0', '162000', '362900', '0'].join('\t'),
    ].join('\n');
    const result = analyzePasteText(text);
    expect(result).toEqual({ format: 'daily', date: '2026-09-18', totalRevenue: 814000 });
  });

  it('falls back to the provided date when no 진료날짜 label appears', () => {
    const text = [SETTLEMENT_HEADER, ['16', '1', '0', '814000', '200900', '451100', '0', '0', '162000', '362900', '0'].join('\t')].join('\n');
    const result = analyzePasteText(text, '2026-09-20');
    expect(result).toEqual({ format: 'daily', date: '2026-09-20', totalRevenue: 814000 });
  });
});

describe('analyzePasteText - monthly settlement', () => {
  it('reads 총진료비 as the whole-month revenue and the month from 월:YYYY-MM', () => {
    const text = [
      '월말 결산표',
      '월:2026-09',
      ['내원환자수', '신규환자수', '자보환자수', '결급환자수', '총진료비', '본인부담', '보험(청구)', '자보(청구)', '산재(청구)', '비급여', '환자부담계', '미수금'].join('\t'),
      ['486', '31', '8', '27.0', '43841860', '7196750', '15745410', '2483200', '0', '18416500', '25613250', '0'].join('\t'),
    ].join('\n');
    const result = analyzePasteText(text);
    expect(result).toEqual({ format: 'monthly', month: '2026-09', totalRevenue: 43841860 });
  });

  it('recognizes a "(YYYY-MM)월" title anchor as well', () => {
    const text = ['(2026-09)월 진료비 내역', SETTLEMENT_HEADER, ['486', '31', '8', '43841860', '7196750', '15745410', '2483200', '0', '18416500', '25613250', '0'].join('\t')].join('\n');
    const result = analyzePasteText(text);
    expect(result).toEqual({ format: 'monthly', month: '2026-09', totalRevenue: 43841860 });
  });
});

describe('analyzePasteText - unrecognized input', () => {
  it('returns unknown for arbitrary text', () => {
    const result = analyzePasteText('hello\tworld');
    expect(result.format).toBe('unknown');
  });

  it('returns unknown for empty input', () => {
    const result = analyzePasteText('   \n  ');
    expect(result.format).toBe('unknown');
  });
});
