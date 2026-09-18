import { describe, expect, it } from 'vitest';
import { analyzePasteText } from './pasteImport';

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

describe('analyzePasteText - daily settlement', () => {
  it('sums 수납총액 across patient rows for a single date', () => {
    const text = ['당일결산 | 2026-09-18', ['차트번호', '성명', '진료구분', '수납총액'].join('\t'), ['006191', '전명옥', '통원', '24000'].join('\t'), ['004695', '우희숙', '통원', '14000'].join('\t')].join(
      '\n'
    );
    const result = analyzePasteText(text);
    expect(result).toEqual({ format: 'daily', date: '2026-09-18', totalRevenue: 38000, rowCount: 2 });
  });

  it('falls back to the provided date when no date appears in the paste', () => {
    const text = [['차트번호', '성명', '수납총액'].join('\t'), ['006191', '전명옥', '24000'].join('\t')].join('\n');
    const result = analyzePasteText(text, '2026-09-20');
    expect(result).toEqual({ format: 'daily', date: '2026-09-20', totalRevenue: 24000, rowCount: 1 });
  });
});

describe('analyzePasteText - monthly settlement', () => {
  it('parses one row per date and resolves MM-DD dates against the title anchor', () => {
    const text = ['월결산표 2026-09', ['일자', '수납총액'].join('\t'), ['2026-09-16', '270400'].join('\t'), ['09-17', '2429440'].join('\t')].join('\n');
    const result = analyzePasteText(text);
    expect(result.format).toBe('monthly');
    if (result.format !== 'monthly') throw new Error('unreachable');
    expect(result.rows).toEqual([
      { date: '2026-09-16', totalRevenue: 270400 },
      { date: '2026-09-17', totalRevenue: 2429440 },
    ]);
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
