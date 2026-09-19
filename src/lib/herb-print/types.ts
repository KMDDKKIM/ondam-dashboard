export type BeforeAfter = "식전" | "식후";

export type Temperature = "따뜻하게" | "미지근하게" | "차게 또는 식혀서";

export type DoctorName = "김동규" | "박소은";

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
