import { describe, expect, it } from 'vitest';
import { validateSignupInput } from './signupValidation';

describe('validateSignupInput', () => {
  it('trims the name and accepts a valid body', () => {
    const result = validateSignupInput({ name: '  홍길동 ', password: '12345678' });
    expect(result).toEqual({ ok: true, value: { name: '홍길동', password: '12345678' } });
  });

  it('rejects non-object bodies', () => {
    for (const body of [null, undefined, 'x', 5]) {
      expect(validateSignupInput(body).ok).toBe(false);
    }
  });

  it('rejects empty, blank and non-string names', () => {
    expect(validateSignupInput({ name: '', password: '12345678' }).ok).toBe(false);
    expect(validateSignupInput({ name: '   ', password: '12345678' }).ok).toBe(false);
    expect(validateSignupInput({ name: 123, password: '12345678' }).ok).toBe(false);
    expect(validateSignupInput({ password: '12345678' }).ok).toBe(false);
  });

  it('enforces the 20 character name limit after trimming', () => {
    expect(validateSignupInput({ name: '가'.repeat(20), password: '12345678' }).ok).toBe(true);
    expect(validateSignupInput({ name: ` ${'가'.repeat(20)} `, password: '12345678' }).ok).toBe(true);
    expect(validateSignupInput({ name: '가'.repeat(21), password: '12345678' }).ok).toBe(false);
  });

  it('requires a password of at least 8 characters', () => {
    expect(validateSignupInput({ name: '홍길동', password: '1234567' }).ok).toBe(false);
    expect(validateSignupInput({ name: '홍길동', password: 12345678 }).ok).toBe(false);
    expect(validateSignupInput({ name: '홍길동' }).ok).toBe(false);
    expect(validateSignupInput({ name: '홍길동', password: '12345678' }).ok).toBe(true);
  });

  it('rejects whitespace-only and over-72-byte passwords (shared validator)', () => {
    expect(validateSignupInput({ name: '홍길동', password: '        ' }).ok).toBe(false);
    expect(validateSignupInput({ name: '홍길동', password: 'a'.repeat(73) }).ok).toBe(false);
    expect(validateSignupInput({ name: '홍길동', password: 'a'.repeat(72) }).ok).toBe(true);
  });
});
