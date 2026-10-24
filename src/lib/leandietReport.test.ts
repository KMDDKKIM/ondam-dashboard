import { describe, expect, it } from 'vitest';
import { discomfortTexts, followUpReason, groupReportPatients, isReportFresh, parseReport, summarize, type LeanPatient } from './leandietReport';

// 환자 이름·번호는 시험용 값이다(공개 저장소).
function patient(p: Partial<LeanPatient> = {}): LeanPatient {
  return {
    leanPatientId: 'p1', chartNumber: 1, name: '가나다', phone: '010-0000-0000', doctor: '김', week: 2, recordStatus: 'recording', hasDiscomfort: false,
    dietYesterday: 3, dietDayBefore: 3, weightYesterday: true, medYesterday: 3, nutritionTags: [], lastDietDate: '2026-10-23', conditions: [],
    chartUrl: 'https://chart.leandiet.co.kr/patients/p1', ...p,
  };
}

describe('parseReport', () => {
  const base = { reportDate: '2026-10-24', baseDate: '2026-10-23', generatedAt: '2026-10-24T09:12:00+09:00', criteria: '시험', patients: [{ name: '가나다', recordStatus: 'partial', week: 3 }] };

  it('정상 데이터를 정리하고 요약은 환자 목록에서 다시 센다', () => {
    const r = parseReport({ ...base, summary: { total: 99 } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.report.summary).toEqual({ total: 1, discomfort: 0, recording: 0, partial: 1, noRecord: 0 });
      expect(r.report.patients[0].recordStatus).toBe('partial');
      expect(r.report.patients[0].leanPatientId).toBe('가나다'); // id가 없으면 이름으로
    }
  });

  it('날짜가 없거나 환자 목록이 아니면 실패', () => {
    expect(parseReport({ ...base, reportDate: '2026/10/24' }).ok).toBe(false);
    expect(parseReport({ ...base, patients: 'x' }).ok).toBe(false);
    expect(parseReport(null).ok).toBe(false);
  });

  it('이름이 없는 환자는 버리고, 모르는 기록 상태는 기록 없음으로 본다', () => {
    const r = parseReport({ ...base, patients: [{ name: '' }, { name: '라마바', recordStatus: '???' }] });
    expect(r.ok && r.report.patients.map((p) => [p.name, p.recordStatus])).toEqual([['라마바', 'none']]);
  });

  it('차트 링크는 린다이어트 차트 주소만 받는다', () => {
    const r = parseReport({ ...base, patients: [{ name: '가', chartUrl: 'https://chart.leandiet.co.kr/patients/1' }, { name: '나', chartUrl: 'https://evil.example.com/x' }] });
    expect(r.ok && r.report.patients.map((p) => p.chartUrl)).toEqual(['https://chart.leandiet.co.kr/patients/1', '']);
  });

  it('너무 많은 환자는 거절한다', () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ name: `환자${i}` }));
    expect(parseReport({ ...base, patients: many }).ok).toBe(false);
  });
});

describe('groupReportPatients', () => {
  const list = [
    patient({ leanPatientId: 'a', name: '가', hasDiscomfort: true, recordStatus: 'recording', week: 5 }),
    patient({ leanPatientId: 'b', name: '나', recordStatus: 'partial', week: 3 }),
    patient({ leanPatientId: 'c', name: '다', recordStatus: 'none', week: 2 }),
    patient({ leanPatientId: 'd', name: '라', recordStatus: 'none', week: 8 }),
    patient({ leanPatientId: 'e', name: '마', recordStatus: 'none', week: 15 }),
    patient({ leanPatientId: 'f', name: '바', recordStatus: 'none', week: null }),
    patient({ leanPatientId: 'g', name: '사', recordStatus: 'recording', week: 1 }),
  ];

  it('불편 사항이 있으면 기록 상태와 상관없이 맨 위 구역에만 들어간다', () => {
    const g = groupReportPatients(list);
    expect(g.discomfort.map((p) => p.name)).toEqual(['가']);
    expect(g.recording.map((p) => p.name)).toEqual(['사']); // '가'는 중복으로 들어가지 않는다
  });

  it('기록 없음은 4주차 이내 / 5~12주차 / 13주차 이상으로 묶는다(주차를 모르면 5~12주차)', () => {
    const g = groupReportPatients(list);
    expect(g.none.early.map((p) => p.name)).toEqual(['다']);
    expect(g.none.mid.map((p) => p.name)).toEqual(['라', '바']);
    expect(g.none.late.map((p) => p.name)).toEqual(['마']);
    expect(g.partial.map((p) => p.name)).toEqual(['나']);
  });

  it('모든 환자가 정확히 한 구역에 들어간다', () => {
    const g = groupReportPatients(list);
    const total = g.discomfort.length + g.partial.length + g.none.early.length + g.none.mid.length + g.none.late.length + g.recording.length;
    expect(total).toBe(list.length);
  });
});

describe('followUpReason / discomfortTexts', () => {
  it('불편 사항은 증상 원문을 중복 없이 이어 붙인다', () => {
    const p = patient({ hasDiscomfort: true, conditions: [{ date: '2026-10-23', bad: true, symptoms: ['변비', '피로감'], detail: '' }, { date: '2026-10-22', bad: false, symptoms: ['변비'], detail: '속이 불편' }] });
    expect(discomfortTexts(p)).toEqual(['변비', '피로감', '속이 불편']);
    expect(followUpReason(p)).toBe('불편: 변비, 피로감, 속이 불편');
  });

  it('기록 상태별 사유', () => {
    expect(followUpReason(patient({ recordStatus: 'partial' }))).toBe('식단 기록 끊김(체중·복약만 기록)');
    expect(followUpReason(patient({ recordStatus: 'none' }))).toBe('기록 없음');
    expect(followUpReason(patient({ hasDiscomfort: true, conditions: [] }))).toBe('불편 사항 확인');
  });

  it('너무 길면 80자로 줄인다', () => {
    const p = patient({ hasDiscomfort: true, conditions: [{ date: '2026-10-23', bad: true, symptoms: ['가'.repeat(120)], detail: '' }] });
    expect(followUpReason(p).length).toBe(80);
  });
});

describe('summarize / isReportFresh', () => {
  it('요약 숫자', () => {
    expect(summarize([patient({ hasDiscomfort: true }), patient({ recordStatus: 'partial' }), patient({ recordStatus: 'none' })])).toEqual({ total: 3, discomfort: 1, recording: 1, partial: 1, noRecord: 1 });
  });

  it('오늘 리포트인지', () => {
    expect(isReportFresh('2026-10-24', '2026-10-24')).toBe(true);
    expect(isReportFresh('2026-10-23', '2026-10-24')).toBe(false);
    expect(isReportFresh(null, '2026-10-24')).toBe(false);
  });
});
