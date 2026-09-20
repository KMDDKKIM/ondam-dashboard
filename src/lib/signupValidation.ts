export const NAME_MAX_LENGTH = 20;
export const PASSWORD_MIN_LENGTH = 8;

export type SignupInput = { name: string; password: string };

export type SignupValidation =
  | { ok: true; value: SignupInput }
  | { ok: false; error: string };

// 가입 신청 본문 검증. 이름은 앞뒤 공백을 자르고 1~20자, 비밀번호는 8자 이상.
// 비밀번호는 자르지 않는다(공백도 비밀번호의 일부일 수 있다).
export function validateSignupInput(body: unknown): SignupValidation {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '요청 형식이 올바르지 않습니다.' };
  }
  const { name, password } = body as { name?: unknown; password?: unknown };

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) {
    return { ok: false, error: '이름을 입력해주세요.' };
  }
  if (trimmedName.length > NAME_MAX_LENGTH) {
    return { ok: false, error: `이름은 ${NAME_MAX_LENGTH}자 이하로 입력해주세요.` };
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.` };
  }
  return { ok: true, value: { name: trimmedName, password } };
}
