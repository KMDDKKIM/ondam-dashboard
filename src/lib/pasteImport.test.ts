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
      ['1', '', '내원', '', '2026-09-18', '19:00', '온달', '000002', '010-0000-0001', '', '김동규', '통원', '침부항', '', '', '2026-09-15'].join('\t'),
      ['2', '', '', '', '2026-09-18', '18:20', '콩쥐', '000001', '010-0000-0000', '', '박소은', '통원', 'U+비급여 추나', '', '', '2026-09-15'].join('\t'),
    ].join('\n');

    const result = analyzePasteText(text);
    expect(result.format).toBe('reservation');
    if (result.format !== 'reservation') throw new Error('unreachable');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].date).toBe('2026-09-18');
    expect(result.groups[0].rows).toHaveLength(2);
    expect(result.groups[0].rows[0]).toMatchObject({
      patientName: '온달',
      chartNo: '000002',
      doctorName: '김동규',
      timeLabel: '19:00',
      treatmentArea: '통원',
      treatment: '침부항',
    });
  });

  it('groups rows by distinct dates when the paste spans multiple days', () => {
    const text = [
      RESERVATION_HEADER,
      ['1', '', '내원', '', '2026-09-18', '19:00', '온달', '000002', '', '', '김동규', '통원', '침부항', '', '', ''].join('\t'),
      ['2', '', '', '', '2026-09-19', '10:00', '콩쥐', '000001', '', '', '박소은', '통원', '침', '', '', ''].join('\t'),
    ].join('\n');

    const result = analyzePasteText(text);
    expect(result.format).toBe('reservation');
    if (result.format !== 'reservation') throw new Error('unreachable');
    expect(result.groups.map((g) => g.date)).toEqual(['2026-09-18', '2026-09-19']);
  });

  it('prefers 취소 over 내원 for visitStatus', () => {
    const text = [
      RESERVATION_HEADER,
      ['1', '', '내원', '취소', '2026-09-18', '10:30', '평강', '', '', '', '김동규', '초진', '', '', '', ''].join('\t'),
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
    expect(result).toEqual({ format: 'daily', date: '2026-09-18', totalRevenue: 814000, visitCount: 16, newPatientCount: 1, invalidCells: [] });
  });

  it('reads the date from the spaced title "일 일 결 산 표:YYYY-MM-DD" (real OK차트 paste)', () => {
    const text = [
      '일 일 결 산 표:2026-09-19',
      SETTLEMENT_HEADER,
      ['16', '1', '0', '814000', '200900', '451100', '0', '0', '162000', '362900', '0'].join('\t'),
    ].join('\n');
    expect(analyzePasteText(text)).toMatchObject({ format: 'daily', date: '2026-09-19', totalRevenue: 814000, visitCount: 16 });
  });

  it('uses a lone date above the header even when the title wording differs', () => {
    const text = [
      '결산 2026-09-21',
      SETTLEMENT_HEADER,
      ['16', '1', '0', '814000', '200900', '451100', '0', '0', '162000', '362900', '0'].join('\t'),
    ].join('\n');
    expect(analyzePasteText(text)).toMatchObject({ format: 'daily', date: '2026-09-21' });
  });

  it('does not mistake a monthly title for a daily date', () => {
    const text = [
      '월말결산:2026-09',
      SETTLEMENT_HEADER,
      ['486', '31', '8', '43841860', '7196750', '15745410', '2483200', '0', '18416500', '25613250', '0'].join('\t'),
    ].join('\n');
    expect(analyzePasteText(text)).toMatchObject({ format: 'monthly', month: '2026-09' });
  });

  it('falls back to the provided date when no 진료날짜 label appears', () => {
    const text = [SETTLEMENT_HEADER, ['16', '1', '0', '814000', '200900', '451100', '0', '0', '162000', '362900', '0'].join('\t')].join('\n');
    const result = analyzePasteText(text, '2026-09-20');
    expect(result).toEqual({ format: 'daily', date: '2026-09-20', totalRevenue: 814000, visitCount: 16, newPatientCount: 1, invalidCells: [] });
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
    expect(result).toEqual({ format: 'monthly', month: '2026-09', totalRevenue: 43841860, avgDailyVisits: null, invalidCells: [] });
  });

  it('reads 진료일평균환자수 from a real 월말결산 paste (title "월말결산:YYYY-MM")', () => {
    const text = [
      '월말결산:2026-09',
      ['내원환자수', '신규환자수', '자보환자수', '진료일평균환자수', '총진료비', '본인부담', '환자부담계', '미수금'].join('\t'),
      ['520', '32', '9', '27.4', '47338780', '7839750', '27567150', '0'].join('\t'),
      ['일자', '내원환자수', '총진료비', '환자부담계', '미수금'].join('\t'),
      ['2026-09-01', '16', '1736170', '705400', '0'].join('\t'),
    ].join('\n');
    expect(analyzePasteText(text)).toEqual({ format: 'monthly', month: '2026-09', totalRevenue: 47338780, avgDailyVisits: 27.4, invalidCells: [] });
  });

  it('recognizes a "(YYYY-MM)월" title anchor as well', () => {
    const text = ['(2026-09)월 진료비 내역', SETTLEMENT_HEADER, ['486', '31', '8', '43841860', '7196750', '15745410', '2483200', '0', '18416500', '25613250', '0'].join('\t')].join('\n');
    const result = analyzePasteText(text);
    expect(result).toEqual({ format: 'monthly', month: '2026-09', totalRevenue: 43841860, avgDailyVisits: null, invalidCells: [] });
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

describe('analyzePasteText - non-numeric cells are reported, not turned into 0', () => {
  it('reports a non-numeric 총진료비 and keeps totalRevenue at 0 without pretending it was read', () => {
    const text = [
      '진료날짜:2026-09-19',
      SETTLEMENT_HEADER,
      ['16', '1', '0', '81a4000', '200900', '451100', '0', '0', '162000', '362900', '0'].join('\t'),
    ].join('\n');
    const result = analyzePasteText(text);
    if (result.format !== 'daily') throw new Error('expected daily');
    expect(result.invalidCells).toEqual(["총진료비: '81a4000'"]);
  });

  it('reports an empty 총진료비 cell', () => {
    const text = [
      '진료날짜:2026-09-19',
      SETTLEMENT_HEADER,
      ['16', '1', '0', '', '200900', '451100', '0', '0', '162000', '362900', '0'].join('\t'),
    ].join('\n');
    const result = analyzePasteText(text);
    if (result.format !== 'daily') throw new Error('expected daily');
    expect(result.invalidCells).toEqual(['총진료비: (비어 있음)']);
  });

  it('reports a non-numeric 내원환자수 and leaves it null instead of 0', () => {
    const text = [
      '진료날짜:2026-09-19',
      SETTLEMENT_HEADER,
      ['열여섯', '1', '0', '814000', '200900', '451100', '0', '0', '162000', '362900', '0'].join('\t'),
    ].join('\n');
    const result = analyzePasteText(text);
    if (result.format !== 'daily') throw new Error('expected daily');
    expect(result.visitCount).toBeNull();
    expect(result.invalidCells).toEqual(["내원환자수: '열여섯'"]);
  });

  it('still accepts thousands separators and the 원 suffix', () => {
    const text = [
      '진료날짜:2026-09-19',
      SETTLEMENT_HEADER,
      ['16', '1', '0', '1,814,000원', '200900', '451100', '0', '0', '162000', '362900', '0'].join('\t'),
    ].join('\n');
    const result = analyzePasteText(text);
    if (result.format !== 'daily') throw new Error('expected daily');
    expect(result.totalRevenue).toBe(1814000);
    expect(result.invalidCells).toEqual([]);
  });

  it('reports a non-numeric monthly 총진료비 too', () => {
    const text = [
      '월말결산:2026-09',
      SETTLEMENT_HEADER,
      ['486', '31', '8', 'N/A', '7196750', '15745410', '2483200', '0', '18416500', '25613250', '0'].join('\t'),
    ].join('\n');
    const result = analyzePasteText(text);
    if (result.format !== 'monthly') throw new Error('expected monthly');
    expect(result.invalidCells).toEqual(["총진료비: 'N/A'"]);
  });
});
