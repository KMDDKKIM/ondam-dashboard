import { describe, expect, it } from 'vitest';
import { parseVisitHistory } from './visitHistoryImport';

const HEADER = ['이름', '차트번호', '나이', '성별', '휴대폰', '우편번호', '주소', 'VIP', '주치의', '진료의', '진행중치료', '예정된치료', '유입경로', '등록일', '내원일수', '총진료비', '본인부담', '청구금액', '비급여', '기간중최초', '기간중최근', '최근내원일'].join('\t');

function row(o: { name: string; chart: string; phone?: string; inflow?: string; reg: string; days: number; first: string; last: string }): string {
  return [o.name, o.chart, '50', '여', o.phone ?? '010-0000-0000', '', '가상시 가상구 가상로 1', '', '김동규', '김동규', '', '', o.inflow ?? '소개', `${o.reg} 오전 12:00:00`, o.days, 100000, 20000, 60000, 20000, `${o.first} 오전 12:00:00`, `${o.last} 오전 12:00:00`, `${o.last} 오전 12:00:00`].join('\t');
}

const SAMPLE = [
  '내원일수/진료비 분석:2026-06-21~2026-09-21',
  HEADER,
  row({ name: '가상하나', chart: '000025', reg: '2017-06-15', days: 5, first: '2026-06-29', last: '2026-09-16' }),
  row({ name: '가상둘', chart: '006544', reg: '2026-09-21', days: 1, first: '2026-09-21', last: '2026-09-21', inflow: '네이버지도' }),
  row({ name: '가상셋', chart: '006366-1', phone: '010-', reg: '2026-09-01', days: 3, first: '2026-09-01', last: '2026-09-07', inflow: '재초진' }),
].join('\n');

describe('parseVisitHistory', () => {
  it('제목에서 분석 기간을, 머리글 이름으로 환자별 칸을 읽는다', () => {
    const r = parseVisitHistory(SAMPLE)!;
    expect(r.periodStart).toBe('2026-06-21');
    expect(r.periodEnd).toBe('2026-09-21');
    expect(r.periodFromTitle).toBe(true);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toEqual({
      chartNo: '000025',
      patientName: '가상하나',
      phone: '010-0000-0000',
      registeredDate: '2017-06-15',
      firstVisit: '2026-06-29',
      lastVisit: '2026-09-16',
      visitDays: 5,
      inflow: '소개',
    });
  });

  it('차트번호 앞의 0과 "-1" 재등록 차트번호를 그대로 둔다', () => {
    const r = parseVisitHistory(SAMPLE)!;
    expect(r.rows[0].chartNo).toBe('000025');
    expect(r.rows[2]).toMatchObject({ chartNo: '006366-1', inflow: '재초진', registeredDate: '2026-09-01' });
  });

  it('제목이 없으면 환자들의 처음·마지막 내원일로 기간을 대신한다', () => {
    const r = parseVisitHistory(SAMPLE.split('\n').slice(1).join('\n'))!;
    expect(r.periodFromTitle).toBe(false);
    expect(r.periodStart).toBe('2026-06-29');
    expect(r.periodEnd).toBe('2026-09-21');
  });

  it('다른 표를 붙여넣으면 null', () => {
    expect(parseVisitHistory('환자이름\t차트번호\t진료일\n가상\t1\t2026-09-21')).toBeNull();
  });
});
