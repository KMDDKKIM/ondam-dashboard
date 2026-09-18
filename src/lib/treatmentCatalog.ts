// 기존 OKTCS(Time Call System) "치료사전" 목록을 그대로 옮겼다. 소요시간(분)은
// 체크한 치료항목들을 더해 베드 타이머의 카운트다운 시간으로 쓴다.
export interface TreatmentCatalogItem {
  name: string;
  minutes: number;
}

export const TREATMENT_CATALOG: TreatmentCatalogItem[] = [
  { name: '물리치료', minutes: 15 },
  { name: '핫팩', minutes: 10 },
  { name: '침 + 부항 + IR', minutes: 20 },
  { name: '침+부항+약침+iR', minutes: 20 },
  { name: '추나', minutes: 10 },
  { name: '침', minutes: 20 },
  { name: '침+부항', minutes: 20 },
  { name: 'U', minutes: 20 },
  { name: 'TA', minutes: 20 },
  { name: '약침원장님실', minutes: 10 },
  { name: '도침치료(원장님실)', minutes: 10 },
];
