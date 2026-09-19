export interface Reservation {
  id?: string;
  dailyRecordId?: string;
  doctorName: string;
  timeLabel: string;
  patientName: string;
  chartNo: string;
  phone: string;
  mobile: string;
  visitStatus: string;
  treatmentArea: string; // 치료부위 — from OK차트's 진료구분 column, editable
  treatment: string; // 치료 — from OK차트's 진료항목+진료패키지 columns, editable
  specialNotes: string; // 특이사항 — no OK차트 source column, manually entered
  memo: string; // 비고 — from OK차트's 예약메모 column, editable
}

export interface DailyRecordSummary {
  id: string;
  date: string; // YYYY-MM-DD
  memoText: string;
  visitCount: number | null;
  // 마감 멘트에서 파싱한 값 — 대시보드 예약률 계산에 쓰인다.
  reservationCount: number | null;
  // 예약자 명단 테이블의 실제 행 수 — 사이드바 "(예약 N명)" 표시에 쓰인다.
  reservationRowCount: number;
  excludedCount: number | null;
  chunaCount: number | null;
  nogyongCount: number | null;
  ilbanCount: number | null;
  firstVisitCount: number | null;
  dietCount: number;
  specialAcupunctureCount: number;
}

export interface DailyRecordFull extends DailyRecordSummary {
  excludedNames: string[];
  chunaNames: string[];
  parseWarnings: string[];
  reservations: Reservation[];
}

export interface WeeklyStats {
  nogyongTotal: number;
  ilbanTotal: number;
  herbTotal: number; // nogyongTotal + ilbanTotal
  chunaTotal: number;
  dietTotal: number;
  specialAcupunctureTotal: number;
}
