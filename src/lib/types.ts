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
  acupunctureSuccess: '성공' | '실패' | '비포함' | null;
  firstVisitDate: string;
  revisit1: string | null;
  revisit2: string | null;
  jaboHerb1: string | null;
  jaboHerb2: string | null;
  jaboHerb3: string | null;
  nextVisitNote: string | null;
  callLog: string | null;
  memo: string | null;
  createdBy: string | null;
  createdAt: string;
  // 해피콜(전화) 진행 상태 — 초진 콜 1건의 결과/재시도/예정일. 아직 없으면 undefined/null.
  callDueDate?: string | null;
  callOriginalDue?: string | null;
  callAttempts?: number;
  callResult?: 'answered' | 'no_answer' | 'refused' | 'unreachable' | null;
  callCompletedBy?: string | null;
  callCompletedAt?: string | null;
  callMemo?: string | null;
  // 예약 명단에서 가져온 차트번호/연락처, 초진/재초진 구분(없으면 초진).
  chartNo?: string | null;
  phone?: string | null;
  visitKind?: '초진' | '재초진';
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

export interface HerbInventoryItem {
  id: string;
  name: string;
  currentStock: number;
  lowStockThreshold: number | null;
  updatedAt: string;
}

export interface HerbInventoryLog {
  id: string;
  herbId: string;
  changeType: 'use' | 'restock';
  amount: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export type GoalCategory = 'herb' | 'diet' | 'special_herb' | 'chuna';

export interface NonCoveredPurchase {
  id: string;
  patientName: string;
  chartNo: string;
  phone: string | null;
  category: string;
  productName: string;
  amount: number | null;
  purchaseDate: string;
  memo: string | null;
  happyCallDate: string | null;
  happyCallEntryId: string | null;
  happyCallEntryId2: string | null;
  happyCallEntryId3: string | null;
  durationDays: number | null;
  goalCategory: GoalCategory | null;
  createdBy: string | null;
  createdAt: string;
}

export interface DailyRevenue {
  date: string;
  totalRevenue: number;
  visitCount: number | null;
  source: 'daily' | 'monthly';
  updatedBy: string | null;
  updatedAt: string;
}

export interface Todo {
  id: string;
  text: string;
  dueDate: string;
  assigneeStaffId: string | null;
  done: boolean;
  doneAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ConsultSummary {
  id: string;
  patientName: string;
  consultDate: string;
  transcript: string;
  summary: string;
  createdBy: string | null;
  createdAt: string;
}

export interface ChatRoom {
  id: string;
  name: string;
  kind: 'topic' | 'chat';
  isPublic: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface ChatRoomWithUnread extends ChatRoom {
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface ChatAttachment {
  id: string;
  messageId: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string | null;
  content: string | null;
  createdAt: string;
  attachments: ChatAttachment[];
}

export interface ChatSearchResult {
  messageId: string;
  roomId: string;
  roomName: string;
  content: string;
  createdAt: string;
}

export interface SupplyItem {
  id: string;
  category: string;
  name: string;
  orderUrl: string | null;
}

export interface SupplyRequest {
  id: string;
  category: string;
  itemName: string;
  orderUrl: string | null;
  memo: string;
  requestedBy: string | null;
  requestedAt: string;
  orderedAt: string | null;
  orderedBy: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
}

export interface NonCoveredProduct {
  id: string;
  name: string;
  sortOrder: number;
}

// 일일 결산 입력에서 함께 저장하는 숫자. 입력하지 않은 항목은 null.
export interface DailyClosing {
  reservationCount: number | null; // 오늘 예약 환자수
  keptCount: number | null; // 예약 정상 이행
  noshowCount: number | null; // 예약 노쇼
  cancelCount: number | null; // 예약 취소
  nextBookingCount: number | null; // 다음예약 접수한 환자수
  chunaCount: number | null; // 추나 횟수(인원)
  excludedCount: number | null; // 제외환자수
}
