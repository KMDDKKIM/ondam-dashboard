import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptRrn, encryptRrn, parseKey } from './rrnCrypto';

const key = randomBytes(32);

describe('rrnCrypto', () => {
  it('암호화한 값을 같은 키로 되돌린다', () => {
    const encrypted = encryptRrn('9012311234567', key);
    expect(encrypted).not.toContain('9012311234567');
    expect(decryptRrn(encrypted, key)).toBe('9012311234567');
  });

  it('같은 값도 매번 다른 암호문이 나온다', () => {
    expect(encryptRrn('9012311234567', key)).not.toBe(encryptRrn('9012311234567', key));
  });

  it('다른 키로는 열리지 않고, 암호문이 바뀌면 거부한다', () => {
    const encrypted = encryptRrn('9012311234567', key);
    expect(() => decryptRrn(encrypted, randomBytes(32))).toThrow();
    const tampered = encrypted.slice(0, -2) + (encrypted.endsWith('AA') ? 'BB' : 'AA');
    expect(() => decryptRrn(tampered, key)).toThrow();
  });

  it('키가 없거나 길이가 틀리면 알려 준다', () => {
    expect(() => parseKey(undefined)).toThrow('설정돼 있지 않아요');
    expect(() => parseKey(Buffer.from('short').toString('base64'))).toThrow('32바이트');
    expect(parseKey(key.toString('base64')).length).toBe(32);
  });
});
