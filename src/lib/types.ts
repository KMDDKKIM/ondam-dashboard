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

export interface HerbInventoryItem {
  id: string;
  name: string;
  unit: string;
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
