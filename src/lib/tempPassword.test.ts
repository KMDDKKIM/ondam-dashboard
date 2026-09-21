import { describe, expect, it } from 'vitest';
import {
  TEMP_PASSWORD_ALPHABET,
  TEMP_PASSWORD_LENGTH,
  generateTempPassword,
  validateNewPassword,
} from './tempPassword';

describe('generateTempPassword', () => {
  const samples = Array.from({ length: 200 }, () => generateTempPassword());

  it('is 12 characters long', () => {
    for (const pw of samples) expect(pw).toHaveLength(TEMP_PASSWORD_LENGTH);
    expect(TEMP_PASSWORD_LENGTH).toBe(12);
  });

  it('only uses the unambiguous alphabet', () => {
    expect(TEMP_PASSWORD_ALPHABET).not.toMatch(/[0O1lI]/);
    for (const pw of samples) {
      for (const ch of pw) expect(TEMP_PASSWORD_ALPHABET).toContain(ch);
    }
  });

  it('always has a lowercase, an uppercase and a digit', () => {
    for (const pw of samples) {
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[0-9]/);
    }
  });

  it('does not repeat across 200 samples', () => {
    expect(new Set(samples).size).toBe(samples.length);
  });

  it('passes the new-password validator', () => {
    for (const pw of samples) expect(validateNewPassword(pw)).toBeNull();
  });
});

describe('validateNewPassword', () => {
  it('accepts 8 to 72 characters', () => {
    expect(validateNewPassword('12345678')).toBeNull();
    expect(validateNewPassword('a'.repeat(72))).toBeNull();
  });

  it('rejects too short passwords', () => {
    expect(validateNewPassword('1234567')).toMatch(/8자 이상/);
  });

  it('rejects too long passwords', () => {
    expect(validateNewPassword('a'.repeat(73))).toMatch(/72자/);
    expect(validateNewPassword('가'.repeat(25))).not.toBeNull(); // 75바이트
  });

  it('rejects empty, whitespace-only and non-string input', () => {
    expect(validateNewPassword('')).not.toBeNull();
    expect(validateNewPassword('          ')).not.toBeNull();
    expect(validateNewPassword(undefined)).not.toBeNull();
    expect(validateNewPassword(12345678)).not.toBeNull();
  });
});
