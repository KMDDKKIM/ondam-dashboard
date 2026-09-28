import { DEFAULT_ETC_NOTE, DEFAULT_STORAGE_NOTE, defaultDoses } from "./constants";
import { todayKst } from "@/lib/kst";
import { createId } from "./storage";
import type { Prescription } from "./types";

export function makeEmptyPrescription(): Prescription {
  const now = new Date().toISOString();
  return {
    id: createId(),
    createdAt: now,
    updatedAt: now,
    // 진료의 목록이 이제 고정돼 있지 않아 여기서는 기본값을 정할 수 없다 — 빈 값으로 두고
    // 화면(herb-print/page.tsx)이 진료의 목록을 불러온 뒤 첫 번째 값으로 채운다.
    doctorName: "",
    patientName: "",
    chiefComplaint: "",
    dosesPerDay: 2,
    doseMode: "meal",
    doses: defaultDoses(2, "meal"),
    temperature: "따뜻하게",
    brewDate: todayKst(),
    restrictedFoods: [],
    restrictedFoodsOther: "",
    storageNote: DEFAULT_STORAGE_NOTE,
    etcNote: DEFAULT_ETC_NOTE,
    personalNote: "",
  };
}

export function duplicateForRepeat(p: Prescription): Prescription {
  const now = new Date().toISOString();
  return {
    ...p,
    id: createId(),
    createdAt: now,
    updatedAt: now,
    brewDate: todayKst(),
  };
}
