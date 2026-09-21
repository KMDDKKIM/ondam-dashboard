import { DEFAULT_ETC_NOTE, DEFAULT_STORAGE_NOTE, DOCTOR_NAMES, defaultDoses } from "./constants";
import { todayKst } from "@/lib/kst";
import { createId } from "./storage";
import type { Prescription } from "./types";

export function makeEmptyPrescription(): Prescription {
  const now = new Date().toISOString();
  return {
    id: createId(),
    createdAt: now,
    updatedAt: now,
    doctorName: DOCTOR_NAMES[0],
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
