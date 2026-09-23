import 'server-only';
import { kstDateOf } from '@/lib/kst';
import type { GrowthMateReservation } from './growthMateSync';

// 핀셋포인트(growth-mate.co.kr, 이 한의원이 쓰는 CRM)에서 예약 상태(정상이행/노쇼/취소)를
// 가져온다. 공식 연동 API가 없어서(2026-09-24 확인), 화면이 쓰는 내부 API를 로그인 세션으로
// 그대로 부른다 — 화면 구조가 바뀌면 같이 깨질 수 있다. 계정 정보는 환경변수로만 받는다
// (GROWTHMATE_EMAIL/GROWTHMATE_PASSWORD, .env.local·Vercel 환경변수에 직접 넣어야 한다 —
// 코드에는 절대 적지 않는다).
const BASE_URL = 'https://growth-mate.co.kr';

interface GrowthMatePatient {
  id: number;
  name: string;
}

interface GrowthMateReservationRow {
  patientId: number;
  reservationDatetime: string; // ISO(UTC)
  visitStatus: string;
}

async function loginGrowthMate(): Promise<string> {
  const email = process.env.GROWTHMATE_EMAIL;
  const password = process.env.GROWTHMATE_PASSWORD;
  if (!email || !password) {
    throw new Error('핀셋포인트 로그인 정보가 설정되지 않았어요(GROWTHMATE_EMAIL/GROWTHMATE_PASSWORD 환경변수).');
  }

  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`핀셋포인트 로그인에 실패했어요(${res.status}). 비밀번호가 바뀌었는지 확인해주세요.`);
  }
  // Fetch 표준은 Set-Cookie 여러 개를 콤마로 합쳐 돌려줘서(쿠키 값 안의 콤마와 섞여 깨진다),
  // Node(undici)의 getSetCookie()로 각각 따로 받는다.
  const cookies = res.headers.getSetCookie?.() ?? [];
  if (cookies.length === 0) {
    throw new Error('핀셋포인트 로그인은 됐는데 세션을 못 받았어요.');
  }
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

async function fetchJson<T>(path: string, cookie: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: cookie } });
  if (!res.ok) {
    throw new Error(`핀셋포인트에서 데이터를 못 가져왔어요(${path}, ${res.status}).`);
  }
  return res.json() as Promise<T>;
}

/** 그 날짜(KST)의 핀셋포인트 예약을 환자 이름 + 상태로 가져온다. */
export async function fetchGrowthMateReservationsForDate(date: string): Promise<GrowthMateReservation[]> {
  const cookie = await loginGrowthMate();
  const [reservationBody, patients] = await Promise.all([
    fetchJson<{ reservations: GrowthMateReservationRow[] }>(
      `/api/reservations/calendar-range?startDate=${encodeURIComponent(date)}&endDate=${encodeURIComponent(date)}`,
      cookie
    ),
    fetchJson<GrowthMatePatient[]>('/api/patients', cookie),
  ]);

  const nameById = new Map(patients.map((p) => [p.id, p.name]));
  return reservationBody.reservations
    .filter((r) => kstDateOf(r.reservationDatetime) === date)
    .map((r) => ({ patientName: nameById.get(r.patientId) ?? '', visitStatus: r.visitStatus }))
    .filter((r) => r.patientName !== '');
}
