// 케어 보드 환자 종류와, 비급여 결제에서 어느 종류로 자동 등록할지(순수 로직) — 원장 요청 2026-10-23.
// 한약·공진단·경옥고·린다이어트를 결제하고 가면 자동으로 케어 보드에 올라가고, 종류마다 해피콜이 달라서 구역을 나눈다.

import { isDietProgramPurchase } from './dietProgram';
import { addDaysKst } from './kst';

export type CareKind = 'herb' | 'diet' | 'special';

export const CARE_KINDS: readonly CareKind[] = ['herb', 'diet', 'special'];

export const CARE_KIND_LABEL: Record<CareKind, string> = {
  herb: '한약',
  diet: '린다이어트',
  special: '특수한약(공진단·경옥고 등)',
};

/** 구역 제목에 붙는 짧은 이름 */
export const CARE_KIND_SHORT: Record<CareKind, string> = { herb: '한약', diet: '린다이어트', special: '특수한약' };

/**
 * 비급여 결제에서 케어 보드 종류를 정한다. 린다이어트(목표 다이어트 + 상품명에 린다이어트) → 린다이어트, 특수한약 목표(공진단·경옥고 등) → 특수한약,
 * 한약 목표 → 한약. 그 밖의 결제(추나, 린데일리 등)는 케어 보드에 올리지 않는다(null).
 */
export function careKindForPurchase(productName: string, goalCategory: string | null): CareKind | null {
  if (isDietProgramPurchase(productName, goalCategory)) return 'diet';
  if (goalCategory === 'special_herb') return 'special';
  if (goalCategory === 'herb') return 'herb';
  return null;
}

/** 린다이어트 환자의 메모 기본 문구 — 다이어트환 시작일부터 3일은 매일, 그 뒤로는 주 1회 해피콜(원장 요청, 2026-10-23). */
export const DIET_CARE_MEMO = '다이어트환 시작일부터 3일 매일, 이후 주1회 해피콜 해주세요';

/** 디톡스를 하는 일수 — 다이어트환은 디톡스 시작일 + 이 일수째에 시작한다. */
export const DETOX_DAYS = 3;

/**
 * 린다이어트 환자가 케어 보드에 새로 올라올 때의 기본값: 다음 해피콜 날짜는 디톡스 시작일 + 3일(다이어트환 시작일), 메모는 해피콜 안내.
 * 디톡스 시작일을 모르면 날짜는 비워 두고 메모만 넣는다.
 */
export function dietCareDefaults(detoxStartDate: string | null | undefined): { nextCallDate: string | null; memo: string } {
  return { nextCallDate: detoxStartDate ? addDaysKst(detoxStartDate, DETOX_DAYS) : null, memo: DIET_CARE_MEMO };
}
