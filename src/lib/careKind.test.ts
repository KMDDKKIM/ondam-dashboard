import { describe, expect, it } from 'vitest';
import { careKindForPurchase, DIET_CARE_MEMO, dietCareDefaults } from './careKind';

describe('careKindForPurchase — 결제에서 케어 보드 종류', () => {
  it('한약 목표 → 한약', () => {
    expect(careKindForPurchase('일반한약', 'herb')).toBe('herb');
    expect(careKindForPurchase('녹용보약', 'herb')).toBe('herb');
  });

  it('특수한약 목표(공진단·경옥고 등) → 특수한약', () => {
    expect(careKindForPurchase('공진단', 'special_herb')).toBe('special');
    expect(careKindForPurchase('경옥고', 'special_herb')).toBe('special');
  });

  it('린다이어트(목표 다이어트 + 상품명) → 린다이어트', () => {
    expect(careKindForPurchase('린다이어트', 'diet')).toBe('diet');
  });

  it('린데일리·추나·목표 없음은 케어 보드에 올리지 않는다', () => {
    expect(careKindForPurchase('린데일리', 'diet')).toBeNull();
    expect(careKindForPurchase('추나 10회', 'chuna')).toBeNull();
    expect(careKindForPurchase('특수약침', null)).toBeNull();
  });
});

describe('dietCareDefaults — 새 린다이어트 환자의 기본 해피콜', () => {
  it('다음 해피콜은 디톡스 시작일 + 3일, 메모는 해피콜 안내', () => {
    expect(dietCareDefaults('2026-10-23')).toEqual({ nextCallDate: '2026-10-26', memo: DIET_CARE_MEMO });
    expect(DIET_CARE_MEMO).toBe('다이어트환 시작일부터 3일 매일, 이후 주1회 해피콜 해주세요');
  });

  it('월말·연말을 넘겨도 맞다', () => {
    expect(dietCareDefaults('2026-12-30').nextCallDate).toBe('2027-01-02');
  });

  it('디톡스 시작일을 모르면 날짜는 비우고 메모만', () => {
    expect(dietCareDefaults(null)).toEqual({ nextCallDate: null, memo: DIET_CARE_MEMO });
  });
});
