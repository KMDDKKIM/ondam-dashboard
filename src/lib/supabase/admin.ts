import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.local.example)'
  );
}

// RLS와 이메일 인증 설정을 모두 우회하는 관리자 클라이언트. 직원 가입신청 승인
// 흐름처럼 서버에서만 실행되는 특권 작업(계정 생성, 다른 사람의 staff 행 갱신)에만
// 쓴다 — 절대 클라이언트 컴포넌트나 브라우저로 값을 내려보내지 않는다.
export function createAdminClient() {
  return createSupabaseClient(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
