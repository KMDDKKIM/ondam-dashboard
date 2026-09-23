import { describe, expect, it } from 'vitest';
import { firstForwardedIp, isIpInCidr, isNaverTalkTalkIp } from './ipAllowlist';

describe('isIpInCidr', () => {
  it('대역 안이면 true', () => {
    expect(isIpInCidr('211.249.40.5', '211.249.40.0', 27)).toBe(true);
    expect(isIpInCidr('211.249.40.30', '211.249.40.0', 27)).toBe(true);
  });
  it('대역 밖이면 false', () => {
    expect(isIpInCidr('211.249.40.32', '211.249.40.0', 27)).toBe(false);
    expect(isIpInCidr('1.2.3.4', '211.249.40.0', 27)).toBe(false);
  });
  it('IPv4 형식이 아니면 false', () => {
    expect(isIpInCidr('not-an-ip', '211.249.40.0', 27)).toBe(false);
    expect(isIpInCidr('', '211.249.40.0', 27)).toBe(false);
    expect(isIpInCidr('::1', '211.249.40.0', 27)).toBe(false);
  });
});

describe('isNaverTalkTalkIp', () => {
  it('네이버톡톡이 문서에서 공개한 대역이면 true', () => {
    expect(isNaverTalkTalkIp('211.249.40.1')).toBe(true);
    expect(isNaverTalkTalkIp('211.249.68.15')).toBe(true);
    expect(isNaverTalkTalkIp('220.230.168.30')).toBe(true);
    expect(isNaverTalkTalkIp('103.6.173.31')).toBe(true);
  });
  it('그 밖의 IP는 false', () => {
    expect(isNaverTalkTalkIp('8.8.8.8')).toBe(false);
    expect(isNaverTalkTalkIp('')).toBe(false);
  });
});

describe('firstForwardedIp', () => {
  it('여러 IP 중 맨 앞(실제 호출한 쪽)만 뽑는다', () => {
    expect(firstForwardedIp('211.249.40.5, 10.0.0.1')).toBe('211.249.40.5');
    expect(firstForwardedIp('211.249.40.5')).toBe('211.249.40.5');
  });
  it('헤더가 없으면 빈 문자열', () => {
    expect(firstForwardedIp(null)).toBe('');
  });
});
