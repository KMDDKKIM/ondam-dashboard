// 새 비밀번호 검사는 가입과 같은 규칙을 쓰려고 signupValidation 에 두고 여기서 다시 내보낸다.
export { validateNewPassword, PASSWORD_MAX_BYTES } from '@/lib/signupValidation';

// 헷갈리는 글자(0/O, 1/l/I)를 뺀 알파벳. 직원에게 말이나 메신저로 전해도 잘못 읽지 않게 한다.
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
export const TEMP_PASSWORD_ALPHABET = LOWER + UPPER + DIGITS;
export const TEMP_PASSWORD_LENGTH = 12;

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
