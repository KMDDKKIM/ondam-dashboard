// 구글폼(비대면진료 신청) 응답 한 건을 대시보드 항목으로 바꾸는 순수 함수들.
// 구글 시트의 Apps Script(onFormSubmit)가 e.namedValues — { "질문 제목": ["답"] } — 를 그대로 보내 오므로,
// 질문 제목의 키워드로 성함·주민번호·연락처·주소를 찾고, 나머지 답은 질문/답 목록으로 그대로 보여 준다.
// 폼 질문이 바뀌거나 늘어나도(예: 12월 상품 추가) 코드를 고치지 않아도 되게 하려는 것이다.

export type RemoteStatus = 'new' | 'success' | 'fail' | 'absent';

export const STATUS_LABEL: Record<RemoteStatus, string> = {
  new: '대기',
  success: '성공',
  fail: '실패',
  absent: '부재',
};

export interface AnswerItem {
  question: string;
  answer: string;
}

export interface ParsedSubmission {
  submittedAt: string; // ISO(UTC)
  rawTimestamp: string;
  patientName: string;
  phone: string;
  address: string;
  service: string;
  /** 숫자 13자리로 읽힌 주민등록번호. 형식이 이상하면 null. */
  rrn: string | null;
  rrnProblem: string | null;
  answers: AnswerItem[];
}

type NamedValues = Record<string, string[] | string | undefined | null>;

function firstValue(v: string[] | string | undefined | null): string {
  if (Array.isArray(v)) return (v[0] ?? '').toString().trim();
  return (v ?? '').toString().trim();
}

// "2026. 9. 21 오후 2:34:56" (한국 로케일 시트) → ISO. 그 밖의 흔한 표기는 Date 로 시도하고, 못 읽으면 null.
export function parseFormTimestamp(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const kr = t.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(오전|오후)\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (kr) {
    const [, y, mo, d, ampm, h, mi, s] = kr;
    let hour = Number(h) % 12;
    if (ampm === '오후') hour += 12;
    // 한국 시각(UTC+9)으로 해석해서 UTC ISO 로 바꾼다.
    const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), hour - 9, Number(mi), Number(s ?? 0));
    return new Date(utc).toISOString();
  }
  const iso = new Date(t);
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
}

export function normalizeRrn(input: string): { rrn: string | null; problem: string | null } {
  const digits = input.replace(/\D/g, '');
  if (!digits) return { rrn: null, problem: null };
  if (digits.length !== 13) return { rrn: null, problem: `주민등록번호가 ${digits.length}자리로 입력됐어요(13자리여야 해요)` };
  return { rrn: digits, problem: null };
}

/** 화면 표시용: 앞 7자리(생년월일+성별)만 보이고 뒤는 가린다. 예) 901231-1****** */
export function maskRrn(prefix: string | null | undefined): string {
  const p = (prefix ?? '').replace(/\D/g, '').slice(0, 7);
  if (p.length < 7) return '-';
  return `${p.slice(0, 6)}-${p.slice(6)}******`;
}

export function formatRrn(rrn: string): string {
  const d = rrn.replace(/\D/g, '');
  return `${d.slice(0, 6)}-${d.slice(6)}`;
}

export function parseFormSubmission(namedValues: NamedValues, now: Date = new Date()): ParsedSubmission {
  let rawTimestamp = '';
  let patientName = '';
  let phone = '';
  let address = '';
  let service = '';
  let rrnInput = '';
  const answers: AnswerItem[] = [];

  for (const [rawQuestion, rawAnswer] of Object.entries(namedValues)) {
    const question = rawQuestion.trim();
    const answer = firstValue(rawAnswer);
    const key = question.replace(/\s+/g, '');

    if (key.includes('타임스탬프')) {
      rawTimestamp = answer;
    } else if (key.includes('동의')) {
      // 개인정보 동의 문구는 목록에 굳이 띄우지 않는다.
    } else if (key.includes('주민')) {
      rrnInput = answer;
    } else if (key.includes('성함') || key === '이름' || key === '성명') {
      patientName = answer;
    } else if (key.includes('핸드폰') || key.includes('휴대') || key.includes('연락처') || key.includes('전화')) {
      phone = answer;
    } else if (key.includes('주소')) {
      address = answer;
    } else if (key.includes('원하시는진료')) {
      service = answer;
    } else if (answer) {
      answers.push({ question, answer });
    }
  }

  const { rrn, problem } = normalizeRrn(rrnInput);

  return {
    submittedAt: parseFormTimestamp(rawTimestamp) ?? now.toISOString(),
    rawTimestamp,
    patientName,
    phone,
    address,
    service,
    rrn,
    rrnProblem: problem,
    answers,
  };
}

/** 같은 응답이 두 번 들어와도 한 번만 저장하도록 하는 재료(원문 시각 + 이름 + 연락처 숫자). */
export function dedupeMaterial(p: Pick<ParsedSubmission, 'rawTimestamp' | 'patientName' | 'phone' | 'submittedAt'>): string {
  const phoneDigits = p.phone.replace(/\D/g, '');
  return [p.rawTimestamp || p.submittedAt, p.patientName.trim(), phoneDigits].join('|');
}
