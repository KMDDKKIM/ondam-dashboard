import { describe, expect, it } from 'vitest';
import { analyzePasteText } from './pasteImport';
import { parseSettlementVisits } from './settlementVisits';

// OK차트 일일 결산표와 같은 모양(맨 위 합계 줄 + 그 아래 환자 목록)을 가상 환자로 만든다.
const SUMMARY_HEADER = ['내원환자수', '신규환자수', '자보환자수', '총진료비', '본인부담', '보험(청구)', '자보(청구)', '산재(청구)', '비급여', '환자부담계', '미수금'].join('\t');
const PATIENT_HEADER = ['환자이름', '차트번호', '진료일', '진료의', '총진료비', '본인부담', '보험(청구)', '자보(청구)', '산재(청구)', '비급여', '환자부담계', '구분', '미수금', '수납총액', '현금수납', '카드수납'].join('\t');

function patient(o: { name: string; chart: string; doctor: string; total: number; pay: number; coverage: string; cash?: number; card?: number; unpaid?: number }): string {
  return [o.name, o.chart, '2026-09-21', o.doctor, o.total, 2400, 22350, 0, 0, 0, o.pay, o.coverage, o.unpaid ?? 0, o.pay, o.cash ?? 0, o.card ?? 0].join('\t');
}

const SAMPLE = [
  '일 일  결 산 표:2026-09-21',
  SUMMARY_HEADER,
  ['3', '1', '0', '100000', '30000', '60000', '0', '0', '10000', '40000', '0'].join('\t'),
  PATIENT_HEADER,
  patient({ name: '가상하나', chart: '004001', doctor: '김동규', total: 24750, pay: 2400, coverage: '경로10%', card: 2400 }),
  patient({ name: '가상둘', chart: '006544', doctor: '박소은', total: 105120, pay: 36800, coverage: '정율', card: 36800 }),
  patient({ name: '가상셋', chart: '006370', doctor: '박소은', total: 51350, pay: 0, coverage: '자동차보험' }),
].join('\n');

describe('parseSettlementVisits', () => {
  it('합계 줄 아래 환자 목록에서 이름·차트번호·진료의·금액·결제를 읽는다', () => {
    const visits = parseSettlementVisits(SAMPLE);
    expect(visits).toHaveLength(3);
    expect(visits[0]).toEqual({
      patientName: '가상하나',
      chartNo: '004001',
      doctorName: '김동규',
      totalFee: 24750,
      patientPay: 2400,
      coverage: '경로10%',
      unpaid: 0,
      cashPay: 0,
      cardPay: 2400,
    });
    expect(visits[1]).toMatchObject({ patientName: '가상둘', chartNo: '006544', doctorName: '박소은', patientPay: 36800 });
    expect(visits[2]).toMatchObject({ coverage: '자동차보험', patientPay: 0 });
  });

  it('차트번호 앞의 0을 지우지 않는다(문자열 그대로)', () => {
    expect(parseSettlementVisits(SAMPLE)[0].chartNo).toBe('004001');
  });

  it('환자 목록 없이 합계 줄만 붙여넣으면 빈 목록', () => {
    const text = ['일 일 결 산 표:2026-09-21', SUMMARY_HEADER, ['3', '1', '0', '100000', '0', '0', '0', '0', '0', '0', '0'].join('\t')].join('\n');
    expect(parseSettlementVisits(text)).toEqual([]);
  });

  it('이름이 빈 줄과 합계 줄은 환자로 세지 않는다', () => {
    const text = [SAMPLE, ['합계', '', '', '', '100000'].join('\t'), ['', '000001', '2026-09-21', '김동규'].join('\t')].join('\n');
    expect(parseSettlementVisits(text)).toHaveLength(3);
  });

  it('맨 위 합계 줄 읽기는 환자 목록이 붙어 있어도 그대로 동작한다', () => {
    expect(analyzePasteText(SAMPLE)).toMatchObject({ format: 'daily', date: '2026-09-21', totalRevenue: 100000, visitCount: 3, newPatientCount: 1 });
  });
});
