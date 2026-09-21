// 주민등록번호 암호화(AES-256-GCM). 서버(API 라우트)에서만 쓴다 — 브라우저 코드에서 가져오지 않는다.
// 저장 형식: "v1.<iv>.<tag>.<암호문>" (모두 base64url). 같은 값도 매번 다른 암호문이 나온다(iv 가 무작위).
// 키는 환경변수 REMOTE_CONSULT_RRN_KEY(base64로 인코딩한 32바이트). 이 키를 잃어버리면 이미 저장된
// 주민번호를 복호화할 수 없으니 반드시 따로 백업한다.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

export function parseKey(base64Key: string | undefined): Buffer {
  if (!base64Key) throw new Error('REMOTE_CONSULT_RRN_KEY 가 설정돼 있지 않아요.');
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('REMOTE_CONSULT_RRN_KEY 는 32바이트(base64)여야 해요.');
  return key;
}

export function encryptRrn(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptRrn(payload: string, key: Buffer): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== VERSION || !iv || !tag || !data) throw new Error('알 수 없는 암호문 형식이에요.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
