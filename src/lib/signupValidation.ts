export const NAME_MAX_LENGTH = 20;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72; // 비밀번호 해시(bcrypt)가 앞 72바이트만 쓴다.

// 비밀번호 검사(가입과 내 계정의 비밀번호 변경이 같이 쓴다). 8자 이상, 72바이트 이하, 공백만으로 된 값은 안 된다.
// 통과하면 null, 아니면 화면에 보여줄 한국어 안내를 돌려준다. 비밀번호는 자르지 않는다.
export function validateNewPassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.trim() === '') {
    return '비밀번호를 입력해주세요.';
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return '비밀번호가 너무 길어요. 72자 이하(한글은 24자 이하)로 입력해주세요.';
  }
  return null;
}

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
  const passwordError = validateNewPassword(password);
  if (passwordError || typeof password !== 'string') {
    return { ok: false, error: passwordError ?? '비밀번호를 입력해주세요.' };
  }
  return { ok: true, value: { name: trimmedName, password } };
}
