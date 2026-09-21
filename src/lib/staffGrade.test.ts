import { describe, expect, it } from 'vitest';
import {
  ASSIGNABLE_GRADES,
  canUseConsultChart,
  DEFAULT_GRADE,
  GRADES,
  gradeAtLeast,
  isAssignableGrade,
  isStaffGrade,
} from './staffGrade';

describe('GRADES', () => {
  it('높은 등급부터 대표원장 > 부원장 > 팀장 > 사원 순서다', () => {
    expect([...GRADES]).toEqual(['대표원장', '부원장', '팀장', '사원']);
  });

  it('지정 가능한 등급에는 대표원장이 없다', () => {
    expect([...ASSIGNABLE_GRADES]).toEqual(['부원장', '팀장', '사원']);
    expect(DEFAULT_GRADE).toBe('사원');
  });

  it('지정 가능한 등급은 모두 전체 등급 목록에 들어 있다', () => {
    for (const grade of ASSIGNABLE_GRADES) {
      expect((GRADES as readonly string[]).includes(grade)).toBe(true);
    }
  });

  it('기본 등급은 지정 가능한 등급이다', () => {
    expect((ASSIGNABLE_GRADES as readonly string[]).includes(DEFAULT_GRADE)).toBe(true);
  });
});

describe('isStaffGrade / isAssignableGrade', () => {
  it('알려진 등급만 통과시킨다', () => {
    expect(isStaffGrade('대표원장')).toBe(true);
    expect(isStaffGrade('원장')).toBe(false);
    expect(isStaffGrade(undefined)).toBe(false);
    expect(isStaffGrade(3)).toBe(false);
  });

  it('대표원장은 지정할 수 없다', () => {
    expect(isAssignableGrade('부원장')).toBe(true);
    expect(isAssignableGrade('팀장')).toBe(true);
    expect(isAssignableGrade('사원')).toBe(true);
    expect(isAssignableGrade('대표원장')).toBe(false);
    expect(isAssignableGrade('')).toBe(false);
    expect(isAssignableGrade(null)).toBe(false);
  });
});

describe('gradeAtLeast', () => {
  it('같은 등급이면 true', () => {
    expect(gradeAtLeast('팀장', '팀장')).toBe(true);
  });

  it('더 높은 등급이면 true, 더 낮으면 false', () => {
    expect(gradeAtLeast('부원장', '팀장')).toBe(true);
    expect(gradeAtLeast('사원', '팀장')).toBe(false);
  });

  it('최상·최하 경계', () => {
    expect(gradeAtLeast('대표원장', '대표원장')).toBe(true);
    expect(gradeAtLeast('부원장', '대표원장')).toBe(false);
    expect(gradeAtLeast('대표원장', '사원')).toBe(true);
    expect(gradeAtLeast('사원', '사원')).toBe(true);
  });
});

describe('canUseConsultChart', () => {
  it('대표원장·부원장만 상담 녹음 차팅을 쓴다', () => {
    expect(canUseConsultChart('대표원장')).toBe(true);
    expect(canUseConsultChart('부원장')).toBe(true);
    expect(canUseConsultChart('팀장')).toBe(false);
    expect(canUseConsultChart('사원')).toBe(false);
    expect(canUseConsultChart(null)).toBe(false);
    expect(canUseConsultChart(undefined)).toBe(false);
  });
});
