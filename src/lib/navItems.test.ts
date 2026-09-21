import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, isActivePath, isWidePath, visibleGroups } from './navItems';

describe('isActivePath', () => {
  it('홈은 정확히 "/"일 때만 켜진다', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/reservations', '/')).toBe(false);
  });

  it('하위 화면도 그 메뉴로 보되, 이름이 비슷한 다른 메뉴와는 섞이지 않는다', () => {
    expect(isActivePath('/herb-print/records', '/herb-print')).toBe(true);
    expect(isActivePath('/herb-inventory', '/herb-print')).toBe(false);
    expect(isActivePath('/happy-call-list', '/happy-call-register')).toBe(false);
  });
});

describe('isWidePath', () => {
  it('표가 넓은 화면만 true', () => {
    expect(isWidePath('/reservations')).toBe(true);
    expect(isWidePath('/herb-print/records')).toBe(true);
    expect(isWidePath('/supply-requests')).toBe(false);
  });
});

describe('일일결산 메뉴', () => {
  it('홈 바로 아래(맨 위 묶음)에 있다', () => {
    expect(NAV_GROUPS[0].items.map((i) => i.href)).toEqual(['/', '/paste-import']);
    expect(NAV_GROUPS[0].items[1].label).toBe('일일결산');
  });
});

describe('visibleGroups', () => {
  const hrefs = (owner: boolean) => visibleGroups(owner).flatMap((g) => g.items.map((i) => i.href));

  it('직원 승인은 대표원장에게만 보인다', () => {
    expect(hrefs(true)).toContain('/staff-approval');
    expect(hrefs(false)).not.toContain('/staff-approval');
  });

  it('백업 내려받기는 대표원장에게만 보인다', () => {
    expect(hrefs(true)).toContain('/backup');
    expect(hrefs(false)).not.toContain('/backup');
  });

  it('상담 녹음 차팅은 대표원장·부원장에게만 보인다', () => {
    const visible = (owner: boolean, grade: Parameters<typeof visibleGroups>[1]) =>
      visibleGroups(owner, grade).flatMap((g) => g.items.map((i) => i.href));
    expect(visible(true, '대표원장')).toContain('/consult-summary');
    expect(visible(false, '부원장')).toContain('/consult-summary');
    expect(visible(false, '팀장')).not.toContain('/consult-summary');
    expect(visible(false, '사원')).not.toContain('/consult-summary');
    expect(visible(false, null)).not.toContain('/consult-summary');
  });

  it('같은 주소가 두 번 들어가지 않는다', () => {
    const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(all).size).toBe(all.length);
  });
});
