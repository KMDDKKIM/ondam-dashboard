// 진료의 목록은 더 이상 여기 고정돼 있지 않다 — 대표원장·부원장 등급의 승인된 직원 계정이
// 곧 진료의 목록이고(doctors 테이블, src/lib/supabase/doctorSync.server.ts가 자동으로 맞춘다),
// 이 화면은 그때그때 그 목록을 불러와 쓴다(herb-print/page.tsx). 그래서 여기서는 평범한
// 문자열이면 된다.
export type DoctorName = string;

export type BeforeAfter = "식전" | "식후";

export type Temperature = "따뜻하게" | "미지근하게" | "차게 또는 식혀서";

// "meal": 식전/식후 + 몇 분 기준. "timeOnly": 식사와 관계없이 시간대에 1포씩.
export type DoseMode = "meal" | "timeOnly";

export interface Dose {
  time: string;
  beforeAfter: BeforeAfter;
  minutes: string;
}

export interface Prescription {
  id: string;
  createdAt: string;
  updatedAt: string;
  doctorName: DoctorName;
  patientName: string;
  chiefComplaint: string;
  dosesPerDay: 2 | 3;
  doseMode: DoseMode;
  doses: Dose[];
  temperature: Temperature;
  brewDate: string;
  restrictedFoods: string[];
  restrictedFoodsOther: string;
  storageNote: string;
  etcNote: string;
  personalNote: string;
}
