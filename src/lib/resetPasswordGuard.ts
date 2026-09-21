export interface ResetTarget {
  id: string;
  role: string | null;
  status: string | null;
}

export type ResetGuardResult = { ok: true } | { ok: false; status: number; error: string };

// 임시 비밀번호를 발급해도 되는 대상인지 판단한다. 승인된 일반 직원만 통과하고,
// 요청자 본인이거나 그 밖의 모든 경우는 막는다(기본이 거부).
export function checkResetTarget(target: ResetTarget | null, requesterId: string | null): ResetGuardResult {
  if (!target) return { ok: false, status: 404, error: '해당 직원을 찾을 수 없습니다.' };
  if (requesterId !== null && target.id === requesterId) {
    return { ok: false, status: 400, error: '내 비밀번호는 "내 계정" 화면에서 바꿀 수 있어요.' };
  }
  if (target.role !== 'staff') {
    return { ok: false, status: 400, error: '대표원장 비밀번호는 "내 계정" 화면에서 직접 바꿔주세요.' };
  }
  if (target.status !== 'approved') {
    return { ok: false, status: 400, error: '아직 승인되지 않은 계정이에요. 먼저 승인해주세요.' };
  }
  return { ok: true };
}
