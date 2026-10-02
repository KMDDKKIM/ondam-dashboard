import type { Todo } from './types';
import { addDaysKst } from './kst';

// "오늘 할 일"에 보일 항목 — 예정일이 오늘이거나 지났는데(자동 이월) 아직 안
// 끝났으면 계속 뜨고, 끝난 건 끝낸 그날 하루만 줄 그은 채로 보여주다가 다음날
// 부터는 빠진다. 예정일이 아직 안 된 항목(미래 예약)은 그 날짜가 될 때까지
// 안 보인다.
export function visibleTodos(todos: Todo[], today: string, assigneeStaffId: string | null = null): Todo[] {
  return todos
    .filter((t) => t.dueDate <= today)
    .filter((t) => !t.done || t.doneAt === today)
    .filter((t) => !assigneeStaffId || t.assigneeStaffId === assigneeStaffId)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
}

// 달력에서 어떤 날짜 칸을 눌렀을 때 아래에 보여줄 할 일. 오늘은 "오늘 할 일"과 똑같이(밀린
// 것 자동 이월 포함), 다른 날짜는 예정일이 정확히 그날인 것만 — 미래 예약도 미리 볼 수 있다.
export function todosForDate(
  todos: Todo[],
  date: string,
  today: string,
  assigneeStaffId: string | null = null
): Todo[] {
  if (date === today) return visibleTodos(todos, today, assigneeStaffId);
  return todos
    .filter((t) => t.dueDate === date)
    .filter((t) => !assigneeStaffId || t.assigneeStaffId === assigneeStaffId)
    .sort((a, b) => Number(a.done) - Number(b.done));
}

// 서버에서 끝난 할 일을 며칠 전 것까지 가져올지(안 끝난 건 날짜와 무관하게 전부 가져온다).
export const COMPLETED_WINDOW_DAYS = 7;

/** 끝난 할 일을 가져올 시작 날짜(포함) — 오늘(KST)에서 7일 전. */
export function completedWindowStart(today: string, days: number = COMPLETED_WINDOW_DAYS): string {
  return addDaysKst(today, -days);
}
