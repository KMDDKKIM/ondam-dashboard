import { PASSWORD_MIN_LENGTH } from '@/lib/signupValidation';

// 헷갈리는 글자(0/O, 1/l/I)를 뺀 알파벳. 직원에게 말이나 메신저로 전해도 잘못 읽지 않게 한다.
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
export const TEMP_PASSWORD_ALPHABET = LOWER + UPPER + DIGITS;
export const TEMP_PASSWORD_LENGTH = 12;
export const PASSWORD_MAX_BYTES = 72; // 비밀번호 해시(bcrypt)가 앞 72바이트만 쓴다.

// 0 이상 max 미만의 정수를 암호학적으로 안전하게 뽑는다(나머지 연산 쏠림을 없애려고 범위 밖 값은 버린다).
function secureInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

// 소문자·대문자·숫자를 모두 포함하는 12자 임시 비밀번호.
export function generateTempPassword(): string {
  for (;;) {
    let out = '';
    for (let i = 0; i < TEMP_PASSWORD_LENGTH; i += 1) {
      out += TEMP_PASSWORD_ALPHABET[secureInt(TEMP_PASSWORD_ALPHABET.length)];
    }
    if (/[a-z]/.test(out) && /[A-Z]/.test(out) && /[0-9]/.test(out)) return out;
  }
}

// 새 비밀번호 검사(내 계정 화면). 가입 규칙(8자 이상)을 그대로 쓰고 상한과 공백 검사만 더한다.
// 통과하면 null, 아니면 화면에 보여줄 한국어 안내를 돌려준다.
export function validateNewPassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.trim() === '') {
    return '새 비밀번호를 입력해주세요.';
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return '비밀번호가 너무 길어요. 72자 이하(한글은 24자 이하)로 입력해주세요.';
  }
  return null;
}
