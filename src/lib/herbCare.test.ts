import { describe, expect, it } from 'vitest';
import { buildHerbCare, herbCareStatus, summarizeCalls, type HerbCareOrder } from './herbCare';

// 환자 이름은 시험용 값이다(공개 저장소).
function order(o: Partial<HerbCareOrder> = {}): HerbCareOrder {
  return { patientName: '가나다', chartNo: '', prescriptionName: '시험탕', orderDate: '2026-10-01', pickupDate: '2026-10-03', daysSupply: 15, packetCount: 15, ...o };
}

describe('buildHerbCare', () => {
  it('수령예정일부터 며칠분 동안 복용 중으로 보고 일차를 센다', () => {
    const [e] = buildHerbCare([order()], '2026-10-10');
    expect(e.startDate).toBe('2026-10-03');
    expect(e.endDate).toBe('2026-10-17');
    expect(e.dayNo).toBe(8);
    expect(e.pickupMissing).toBe(false);
    expect(herbCareStatus(e)).toBe('8/15일째');
  });

  it('수령예정일이 없으면 처방일을 시작일로 쓰고 수령일 미입력으로 표시', () => {
    const [e] = buildHerbCare([order({ pickupDate: null })], '2026-10-05');
    expect(e.startDate).toBe('2026-10-01');
    expect(e.pickupMissing).toBe(true);
  });

  it('며칠분이 없으면 첩수로 본다', () => {
    const [e] = buildHerbCare([order({ daysSupply: null, packetCount: 10 })], '2026-10-05');
    expect(e.days).toBe(10);
  });

  it('환자별로 가장 최근 처방전만 본다', () => {
    const list = buildHerbCare([order({ orderDate: '2026-09-01', pickupDate: '2026-09-02', prescriptionName: '옛 처방' }), order({ prescriptionName: '새 처방' })], '2026-10-10');
    expect(list).toHaveLength(1);
    expect(list[0].prescriptionName).toBe('새 처방');
  });

  it('끝난 지 14일이 넘으면 빠지고, 안이면 종료 N일 지남', () => {
    expect(herbCareStatus(buildHerbCare([order()], '2026-10-20')[0])).toBe('종료 3일 지남');
    expect(buildHerbCare([order()], '2026-11-05')).toEqual([]);
  });

  it('끝나는 날이 가까운 환자가 위', () => {
    const list = buildHerbCare([order({ patientName: '나', pickupDate: '2026-10-08' }), order({ patientName: '가', pickupDate: '2026-10-03' })], '2026-10-10');
    expect(list.map((e) => e.patientName)).toEqual(['가', '나']);
  });

  it('시작 전이면 D-day', () => {
    expect(herbCareStatus(buildHerbCare([order({ pickupDate: '2026-10-12' })], '2026-10-10')[0])).toBe('복용 시작 D-2');
  });
});

describe('summarizeCalls — 마지막·다음 해피콜', () => {
  const kst = (iso: string) => iso.slice(0, 10); // 시험에서는 UTC 날짜를 그대로 쓴다

  it('마지막으로 전화한 날은 결과를 기록한 시각 중 가장 늦은 날(부재중 시도 포함)', () => {
    const r = summarizeCalls(
      [
        { callDate: '2026-10-10', done: true, completedAt: '2026-10-10T03:00:00Z' },
        { callDate: '2026-10-14', done: false, completedAt: '2026-10-15T03:00:00Z' }, // 부재중 시도
        { callDate: '2026-10-25', done: false, completedAt: null },
      ],
      kst
    );
    expect(r.lastCallDate).toBe('2026-10-15');
    expect(r.nextCallDate).toBe('2026-10-14'); // 아직 끝나지 않은 해피콜 중 가장 이른 날
  });

  it('끝나지 않은 해피콜이 없으면 다음 해피콜 없음, 전화한 적이 없으면 마지막 없음', () => {
    expect(summarizeCalls([{ callDate: '2026-10-10', done: true, completedAt: '2026-10-10T03:00:00Z' }], kst)).toEqual({ lastCallDate: '2026-10-10', nextCallDate: null });
    expect(summarizeCalls([{ callDate: '2026-10-25', done: false, completedAt: null }], kst)).toEqual({ lastCallDate: null, nextCallDate: '2026-10-25' });
    expect(summarizeCalls([], kst)).toEqual({ lastCallDate: null, nextCallDate: null });
  });
});
