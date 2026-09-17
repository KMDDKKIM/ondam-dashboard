export interface Staff {
  id: string;
  name: string;
  role: 'owner' | 'staff';
}

export interface HappyCallPatient {
  id: string;
  patientName: string;
  doctorStaffId: string | null;
  patientType: '건보' | '자보' | '비급여';
  acupunctureSuccess: '성공' | '실패' | null;
  firstVisitDate: string;
  revisit1: string | null;
  revisit2: string | null;
  revisit3: string | null;
  jaboHerb1: string | null;
  jaboHerb2: string | null;
  jaboHerb3: string | null;
  nextVisitNote: string | null;
  callLog: string | null;
  memo: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface HerbMedicinePrescription {
  id: string;
  patientName: string;
  pickupDate: string;
  durationDays: number;
  callDate1: string;
  callDate2: string;
  callDate3: string;
  call1Done: boolean;
  call2Done: boolean;
  call3Done: boolean;
  call1Note: string | null;
  call2Note: string | null;
  call3Note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface DietPackage {
  id: string;
  patientName: string;
  detoxStartDate: string;
  createdBy: string | null;
  createdAt: string;
}

export interface DietPackageCall {
  id: string;
  packageId: string;
  callDate: string;
  done: boolean;
  note: string | null;
}

export interface HappyCallManualEntry {
  id: string;
  patientName: string;
  note: string | null;
  callDate: string;
  done: boolean;
  doneNote: string | null;
  createdBy: string | null;
  createdAt: string;
}
