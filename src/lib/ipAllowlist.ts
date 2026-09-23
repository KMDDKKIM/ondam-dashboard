// 네이버 톡톡 챗봇 웹훅은 서명 같은 인증 수단이 없어서(2026-09-23 확인), 네이버가 문서에서
// ACL용으로 공개한 IP 대역으로만 받는다.
// https://github.com/navertalk/chatbot-api#webhook-요구-사항
export const NAVER_TALKTALK_IP_RANGES: readonly [string, number][] = [
  ['211.249.40.0', 27],
  ['211.249.68.0', 27],
  ['220.230.168.0', 27],
  ['103.6.173.0', 27],
];

function ipToInt(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

/** ip가 base/prefixLength 대역에 속하는지. ip나 base가 IPv4 형식이 아니면 false. */
export function isIpInCidr(ip: string, base: string, prefixLength: number): boolean {
  const ipInt = ipToInt(ip);
  const baseInt = ipToInt(base);
  if (ipInt == null || baseInt == null) return false;
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export function isNaverTalkTalkIp(ip: string): boolean {
  return NAVER_TALKTALK_IP_RANGES.some(([base, prefix]) => isIpInCidr(ip, base, prefix));
}

/** "x-forwarded-for" 헤더 값에서 맨 앞(실제 호출한 쪽) IP만 뽑는다. 헤더가 없으면 빈 문자열. */
export function firstForwardedIp(headerValue: string | null): string {
  return (headerValue ?? '').split(',')[0]?.trim() ?? '';
}
