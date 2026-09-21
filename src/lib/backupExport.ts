// 백업(CSV 내려받기)에 내보낼 자료 목록. 대표원장 전용 화면(/backup)과 API(/api/export)가 함께 쓴다.
// 열은 하나하나 적어 둔 것만 내보낸다(select * 금지). 주민등록번호(remote_consult_rrn*)나 암호화 열은
// 절대 넣지 않는다 — 비대면진료 신청 자료는 백업 대상이 아니다.

export interface ExportColumn {
  /** DB 열 이름 */
  key: string;
  /** CSV 머리글(한글) */
  header: string;
  /** true 면 staff id 를 직원 이름으로 바꿔 쓴다 */
  staff?: boolean;
}

export interface ExportDataset {
  label: string;
  /** 월을 골라야 하는 자료인지 */
  monthly: boolean;
  /** 월 조건을 거는 날짜 열(monthly 이고 일반 조회일 때) */
  monthColumn?: string;
  /** 일반 조회 대상 테이블(직접 조회하는 자료만) */
  table?: string;
  columns: ExportColumn[];
  /** 정렬 열(직접 조회하는 자료만) */
  orderBy?: string[];
}

export const EXPORT_DATASETS: Record<string, ExportDataset> = {
  // 예약관리 앱 소유 테이블 — dailyRecords.server.ts 의 서버 도우미로 읽는다(라우트에서 처리).
  reservations: {
    label: '예약 명단',
    monthly: true,
    columns: [
      { key: 'date', header: '날짜' },
      { key: 'doctorName', header: '진료의' },
      { key: 'timeLabel', header: '시간' },
      { key: 'patientName', header: '환자명' },
      { key: 'chartNo', header: '차트번호' },
      { key: 'phone', header: '전화' },
      { key: 'mobile', header: '휴대전화' },
      { key: 'visitStatus', header: '내원상태' },
      { key: 'treatmentArea', header: '치료부위' },
      { key: 'treatment', header: '치료' },
      { key: 'specialNotes', header: '특이사항' },
      { key: 'memo', header: '비고' },
    ],
  },
  daily_closing: {
    label: '일일 결산',
    monthly: true,
    columns: [
      { key: 'date', header: '날짜' },
      { key: 'total_revenue', header: '총진료비' },
      { key: 'visit_count', header: '방문수(결산)' },
      { key: 'new_patient_count', header: '신규환자수' },
      { key: 'reservation_count', header: '예약환자수' },
      { key: 'kept_count', header: '예약 이행' },
      { key: 'noshow_count', header: '노쇼' },
      { key: 'cancel_count', header: '취소' },
      { key: 'next_booking_count', header: '다음예약' },
      { key: 'chuna_count', header: '추나' },
      { key: 'excluded_count', header: '제외환자수' },
      { key: 'source', header: '입력 방식' },
      { key: 'nogyongCount', header: '녹용 한약(예약관리)' },
      { key: 'ilbanCount', header: '일반 한약(예약관리)' },
      { key: 'dietCount', header: '다이어트(예약관리)' },
      { key: 'specialAcupunctureCount', header: '특수침(예약관리)' },
      { key: 'memoText', header: '마감 멘트' },
    ],
  },
  happy_call_patients: {
    label: '초진 해피콜',
    monthly: false,
    table: 'happy_call_patients',
    orderBy: ['first_visit_date', 'created_at', 'id'],
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'patient_name', header: '환자명' },
      { key: 'chart_no', header: '차트번호' },
      { key: 'phone', header: '전화' },
      { key: 'visit_kind', header: '초진/재초진' },
      { key: 'doctor_staff_id', header: '진료의', staff: true },
      { key: 'patient_type', header: '환자구분' },
      { key: 'acupuncture_package_success', header: '약침 패키지' },
      { key: 'first_visit_date', header: '초진일' },
      { key: 'revisit_1', header: '재방문1' },
      { key: 'revisit_2', header: '재방문2' },
      { key: 'revisit_3', header: '재방문3' },
      { key: 'jabo_herb_1', header: '자보 한약1' },
      { key: 'jabo_herb_2', header: '자보 한약2' },
      { key: 'jabo_herb_3', header: '자보 한약3' },
      { key: 'next_visit_note', header: '다음 내원 메모' },
      { key: 'call_log', header: '통화 기록' },
      { key: 'memo', header: '메모' },
      { key: 'call_due_date', header: '통화 예정일' },
      { key: 'call_original_due', header: '원래 통화 예정일' },
      { key: 'call_attempts', header: '통화 시도 횟수' },
      { key: 'call_result', header: '통화 결과' },
      { key: 'call_completed_at', header: '통화 완료 시각' },
      { key: 'call_memo', header: '통화 메모' },
      { key: 'created_at', header: '등록 시각' },
    ],
  },
  non_covered_purchases: {
    label: '비급여 구매',
    monthly: true,
    monthColumn: 'purchase_date',
    table: 'non_covered_purchases',
    orderBy: ['purchase_date', 'created_at', 'id'],
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'purchase_date', header: '구매일' },
      { key: 'patient_name', header: '환자명' },
      { key: 'chart_no', header: '차트번호' },
      { key: 'phone', header: '전화' },
      { key: 'category', header: '분류' },
      { key: 'product_name', header: '상품' },
      { key: 'amount', header: '금액' },
      { key: 'duration_days', header: '처방일수' },
      { key: 'goal_category', header: '목표 분류' },
      { key: 'happy_call_date', header: '해피콜 예정일' },
      { key: 'memo', header: '메모' },
      { key: 'created_at', header: '등록 시각' },
    ],
  },
  consult_summaries: {
    label: '상담 요약',
    monthly: false,
    table: 'consult_summaries',
    orderBy: ['created_at', 'id'],
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'consult_date', header: '상담일' },
      { key: 'patient_name', header: '환자명' },
      { key: 'summary', header: '요약' },
      { key: 'transcript', header: '원문' },
      { key: 'created_by', header: '작성자', staff: true },
      { key: 'created_at', header: '저장 시각' },
    ],
  },
  herb_inventory: {
    label: '한약재 재고',
    monthly: false,
    table: 'herb_inventory',
    orderBy: ['name', 'id'],
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'name', header: '약재명' },
      { key: 'unit', header: '단위' },
      { key: 'current_stock', header: '현재고' },
      { key: 'low_stock_threshold', header: '부족 기준' },
      { key: 'updated_at', header: '수정 시각' },
      { key: 'created_at', header: '등록 시각' },
    ],
  },
  supply_requests: {
    label: '물품신청',
    monthly: false,
    table: 'supply_requests',
    orderBy: ['requested_at', 'id'],
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'category', header: '분류' },
      { key: 'item_name', header: '물품' },
      { key: 'order_url', header: '주문 링크' },
      { key: 'memo', header: '메모' },
      { key: 'requested_by', header: '신청자', staff: true },
      { key: 'requested_at', header: '신청 시각' },
      { key: 'ordered_by', header: '주문 처리자', staff: true },
      { key: 'ordered_at', header: '주문완료 시각' },
      { key: 'received_by', header: '도착 확인자', staff: true },
      { key: 'received_at', header: '도착 시각' },
    ],
  },
  reception_records: {
    label: '접수기록부',
    monthly: true,
    monthColumn: 'visit_date',
    table: 'reception_records',
    orderBy: ['visit_date', 'seq', 'created_at', 'id'],
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'visit_date', header: '날짜' },
      { key: 'seq', header: '번호' },
      { key: 'visit_kind', header: '구분' },
      { key: 'patient_name', header: '성명' },
      { key: 'birth_date', header: '생년월일' },
      { key: 'treatment', header: '치료내역' },
      { key: 'fee', header: '진료비' },
      { key: 'payment', header: '결제' },
      { key: 'reserved', header: '다음 예약' },
      { key: 'note', header: '비고' },
      { key: 'created_at', header: '등록 시각' },
    ],
  },
};

/** 미리 정해둔 자료 이름인지(프로토타입 키 등은 통과시키지 않는다). */
export function getExportDataset(name: string | null): ExportDataset | null {
  if (!name || !Object.prototype.hasOwnProperty.call(EXPORT_DATASETS, name)) return null;
  return EXPORT_DATASETS[name];
}

export interface MonthRange {
  /** 그 달 1일 YYYY-MM-DD */
  from: string;
  /** 다음 달 1일 YYYY-MM-DD (미포함) */
  to: string;
  /** 그 달의 모든 날짜 */
  dates: string[];
}

/** YYYY-MM 을 엄격히 확인하고 그 달의 날짜 범위를 돌려준다. 틀리면 null. */
export function parseMonth(month: string | null): MonthRange | null {
  if (!month) return null;
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (year < 2000 || year > 2100) return null;
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${year}-${pad(mon)}-${pad(i + 1)}`);
  const to = mon === 12 ? `${year + 1}-01-01` : `${year}-${pad(mon + 1)}-01`;
  return { from: `${year}-${pad(mon)}-01`, to, dates };
}
