import { describe, expect, it } from 'vitest';
import { isCountedOrder, packageAfterPrintText, packageBalance, packageDaysFromPurchase, packageNote, PRINT_TRACKING_START } from './herbPackage';

// 환자·상품 이름은 시험용 값이다(공개 저장소).
describe('packageDaysFromPurchase — 비급여 결제에서 패키지 일수', () => {
  const herb = (productName: string, durationDays: number | null = null) => ({ productName, goalCategory: 'herb', durationDays });

  it('상품명에 3개월이면 90일, 1개월이면 30일', () => {
    expect(packageDaysFromPurchase(herb('한약 3개월'))).toBe(90);
    expect(packageDaysFromPurchase(herb('일반한약(3 개월)'))).toBe(90);
    expect(packageDaysFromPurchase(herb('한약 1개월'))).toBe(30);
    expect(packageDaysFromPurchase(herb('한약 한 달'))).toBe(30);
  });

  it('이름에 없으면 처방일수가 30일 이상일 때만 그 일수', () => {
    expect(packageDaysFromPurchase(herb('시험보약', 30))).toBe(30);
    expect(packageDaysFromPurchase(herb('시험보약', 90))).toBe(90);
    expect(packageDaysFromPurchase(herb('시험보약', 15))).toBeNull();
    expect(packageDaysFromPurchase(herb('시험보약'))).toBeNull();
  });

  it('한약(목표 반영)이 아닌 결제는 패키지가 아니다', () => {
    expect(packageDaysFromPurchase({ productName: '시험다이어트 3개월', goalCategory: 'diet', durationDays: null })).toBeNull();
    expect(packageDaysFromPurchase({ productName: '시험추나 3개월', goalCategory: null, durationDays: 90 })).toBeNull();
  });
});

describe('packageBalance — 잔여 일수', () => {
  const pkg = [{ totalDays: 90, startDate: '2026-10-21' }];

  it('결제일 이후 출력한 처방전의 며칠분을 차감한다(15일·30일·10일씩 나가도 합산)', () => {
    const orders = [
      { orderDate: '2026-10-21', daysSupply: 30 },
      { orderDate: '2026-11-20', daysSupply: 15 },
      { orderDate: '2026-12-05', daysSupply: 10 },
    ];
    expect(packageBalance(pkg, orders)).toEqual({ totalDays: 90, usedDays: 55, remainingDays: 35, overDays: 0 });
  });

  it('결제일 전 처방전은 차감하지 않는다', () => {
    expect(packageBalance(pkg, [{ orderDate: '2026-10-20', daysSupply: 30 }])?.usedDays).toBe(0);
  });

  it('며칠분이 없으면 첩수로 본다', () => {
    expect(packageBalance(pkg, [{ orderDate: '2026-10-22', daysSupply: null, packetCount: 10 }])?.usedDays).toBe(10);
  });

  it('패키지를 넘기면 잔여 0, 넘긴 일수를 알려 준다', () => {
    expect(packageBalance(pkg, [{ orderDate: '2026-10-22', daysSupply: 100 }])).toEqual({ totalDays: 90, usedDays: 100, remainingDays: 0, overDays: 10 });
  });

  it('패키지가 여러 개면 합산한다(추가 결제)', () => {
    const two = [...pkg, { totalDays: 30, startDate: '2026-12-01' }];
    expect(packageBalance(two, [{ orderDate: '2026-10-22', daysSupply: 100 }])?.remainingDays).toBe(20);
  });

  it('패키지가 없으면 null', () => {
    expect(packageBalance([], [{ orderDate: '2026-10-22', daysSupply: 10 }])).toBeNull();
  });
});

describe('packageNote — 처방전 화면 안내', () => {
  const balance = { totalDays: 90, usedDays: 15, remainingDays: 75, overDays: 0 };

  it('이번 처방 후 남는 일수', () => {
    expect(packageNote(balance, 30)).toEqual({ level: 'ok', text: '한약 패키지 잔여 75일 (총 90일 중 15일 사용) → 이번 30일분 처방 후 45일 남아요' });
  });

  it('잔여보다 많이 처방하면 경고', () => {
    const n = packageNote({ ...balance, usedDays: 75, remainingDays: 15 }, 30);
    expect(n?.level).toBe('warn');
    expect(n?.text).toContain('15일을 넘어요');
  });

  it('다 썼으면 경고', () => {
    expect(packageNote({ totalDays: 30, usedDays: 30, remainingDays: 0, overDays: 0 }, 15)?.level).toBe('warn');
  });

  it('며칠분을 아직 안 적었으면 잔여만 보여 준다', () => {
    expect(packageNote(balance, 0)).toEqual({ level: 'ok', text: '한약 패키지 잔여 75일 (총 90일 중 15일 사용)' });
  });

  it('패키지가 없으면 안내 없음', () => {
    expect(packageNote(null, 30)).toBeNull();
  });
});

describe('packageAfterPrintText — 출력 뒤 잔여 안내', () => {
  it('30일 결제에서 15일이 나가면 15일 남은 것을 알려 준다', () => {
    const balance = packageBalance([{ totalDays: 30, startDate: '2026-10-21' }], [{ orderDate: '2026-10-21', daysSupply: 15 }]);
    expect(packageAfterPrintText('가나다', balance)).toEqual({ level: 'ok', text: '가나다님 한약 패키지 잔여 15일 (총 30일 중 15일 사용)' });
  });

  it('다 썼거나 넘겼으면 경고', () => {
    const used = packageBalance([{ totalDays: 30, startDate: '2026-10-21' }], [{ orderDate: '2026-10-21', daysSupply: 30 }]);
    expect(packageAfterPrintText('가나다', used)?.level).toBe('warn');
    const over = packageBalance([{ totalDays: 30, startDate: '2026-10-21' }], [{ orderDate: '2026-10-21', daysSupply: 40 }]);
    expect(packageAfterPrintText('가나다', over)?.text).toContain('10일 넘겨');
  });

  it('패키지가 없으면 안내 없음', () => {
    expect(packageAfterPrintText('가나다', null)).toBeNull();
  });
});

describe('isCountedOrder — 차감할 처방전', () => {
  it('출력을 마친 처방전은 센다', () => {
    expect(isCountedOrder({ orderDate: '2026-10-20', printedAt: '2026-10-20T01:00:00Z' })).toBe(true);
  });

  it('출력 표시를 남기기 시작한 뒤의 저장만 한 처방전은 세지 않는다', () => {
    expect(isCountedOrder({ orderDate: PRINT_TRACKING_START, printedAt: null })).toBe(false);
    expect(isCountedOrder({ orderDate: '2026-10-21' })).toBe(false);
  });

  it('그 전(옛) 처방전은 출력 표시가 없어도 센다 — 이미 결제한 환자를 직접 등록할 때 지난 처방도 차감되게', () => {
    expect(isCountedOrder({ orderDate: '2026-10-01', printedAt: null })).toBe(true);
  });
});
