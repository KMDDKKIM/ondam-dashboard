// 높은 등급이 앞에 온다. gradeAtLeast가 이 순서를 그대로 쓴다.
export const GRADES = ['대표원장', '부원장', '팀장', '사원'] as const;
export type StaffGrade = (typeof GRADES)[number];

// 화면·API에서 지정할 수 있는 등급. 대표원장은 지정하지 않는다.
export const ASSIGNABLE_GRADES = ['부원장', '팀장', '사원'] as const;
export type AssignableGrade = (typeof ASSIGNABLE_GRADES)[number];

export const DEFAULT_GRADE: AssignableGrade = '사원';

export function isStaffGrade(value: unknown): value is StaffGrade {
  return typeof value === 'string' && (GRADES as readonly string[]).includes(value);
}

export function isAssignableGrade(value: unknown): value is AssignableGrade {
  return typeof value === 'string' && (ASSIGNABLE_GRADES as readonly string[]).includes(value);
}

// grade가 min과 같거나 더 높은 등급인지. 예: gradeAtLeast('팀장', '팀장') === true,
// gradeAtLeast('사원', '팀장') === false.
export function gradeAtLeast(grade: StaffGrade, min: StaffGrade): boolean {
  return GRADES.indexOf(grade) <= GRADES.indexOf(min);
}

// 상담 녹음 차팅은 원장님만(대표원장 · 부원장) 쓴다. 화면·API·DB가 모두 이 기준을 따른다.
export const CONSULT_CHART_MIN_GRADE: StaffGrade = '부원장';

export function canUseConsultChart(grade: StaffGrade | null | undefined): boolean {
  return grade != null && gradeAtLeast(grade, CONSULT_CHART_MIN_GRADE);
}
