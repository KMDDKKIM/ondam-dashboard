import { describe, expect, it } from 'vitest';
import { completedWindowStart, todosForDate, visibleTodos } from './todoVisibility';
import type { Todo } from './types';

function makeTodo(overrides: Partial<Todo>): Todo {
  return {
    id: 'id',
    text: '할 일',
    dueDate: '2026-09-18',
    assigneeStaffId: null,
    done: false,
    doneAt: null,
    createdBy: null,
    createdAt: '2026-09-18T00:00:00Z',
    ...overrides,
  };
}

describe('visibleTodos', () => {
  it('hides a todo scheduled for the future', () => {
    const todos = [makeTodo({ id: 'a', dueDate: '2026-09-21' })];
    expect(visibleTodos(todos, '2026-09-18')).toEqual([]);
  });

  it('shows a todo due today', () => {
    const todos = [makeTodo({ id: 'a', dueDate: '2026-09-18' })];
    expect(visibleTodos(todos, '2026-09-18').map((t) => t.id)).toEqual(['a']);
  });

  it('rolls over an incomplete overdue todo without needing its due_date updated', () => {
    const todos = [makeTodo({ id: 'a', dueDate: '2026-09-15', done: false })];
    expect(visibleTodos(todos, '2026-09-18').map((t) => t.id)).toEqual(['a']);
  });

  it('keeps a todo visible on the day it was completed', () => {
    const todos = [makeTodo({ id: 'a', dueDate: '2026-09-18', done: true, doneAt: '2026-09-18' })];
    expect(visibleTodos(todos, '2026-09-18').map((t) => t.id)).toEqual(['a']);
  });

  it('drops a todo the day after it was completed', () => {
    const todos = [makeTodo({ id: 'a', dueDate: '2026-09-17', done: true, doneAt: '2026-09-17' })];
    expect(visibleTodos(todos, '2026-09-18')).toEqual([]);
  });

  it('filters by assignee when given', () => {
    const todos = [
      makeTodo({ id: 'a', assigneeStaffId: 'staff-1' }),
      makeTodo({ id: 'b', assigneeStaffId: 'staff-2' }),
      makeTodo({ id: 'c', assigneeStaffId: null }),
    ];
    expect(visibleTodos(todos, '2026-09-18', 'staff-1').map((t) => t.id)).toEqual(['a']);
  });

  it('sorts incomplete items before completed ones', () => {
    const todos = [
      makeTodo({ id: 'done', done: true, doneAt: '2026-09-18' }),
      makeTodo({ id: 'pending' }),
    ];
    expect(visibleTodos(todos, '2026-09-18').map((t) => t.id)).toEqual(['pending', 'done']);
  });
});

describe('completedWindowStart', () => {
  it('오늘에서 7일 전 날짜', () => {
    expect(completedWindowStart('2026-09-21')).toBe('2026-09-14');
  });

  it('달이 바뀌어도 맞다', () => {
    expect(completedWindowStart('2026-03-03')).toBe('2026-02-24');
  });
});

describe('todosForDate', () => {
  const today = '2026-09-18';

  it('오늘 칸은 "오늘 할 일"과 같다(밀린 것 이월 포함)', () => {
    const todos = [makeTodo({ id: 'a', dueDate: '2026-09-15' }), makeTodo({ id: 'b', dueDate: '2026-09-18' })];
    expect(todosForDate(todos, today, today).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('미래 날짜 칸은 그날 예정인 것만 미리 보여준다', () => {
    const todos = [makeTodo({ id: 'a', dueDate: '2026-09-21' }), makeTodo({ id: 'b', dueDate: '2026-09-22' })];
    expect(todosForDate(todos, '2026-09-21', today).map((t) => t.id)).toEqual(['a']);
  });

  it('지난 날짜 칸은 그날 예정이던 것만(끝난 것 포함)', () => {
    const todos = [
      makeTodo({ id: 'a', dueDate: '2026-09-10', done: true, doneAt: '2026-09-10' }),
      makeTodo({ id: 'b', dueDate: '2026-09-10' }),
      makeTodo({ id: 'c', dueDate: '2026-09-11' }),
    ];
    expect(todosForDate(todos, '2026-09-10', today).map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('담당자로 거른다', () => {
    const todos = [makeTodo({ id: 'a', dueDate: '2026-09-21', assigneeStaffId: 's1' }), makeTodo({ id: 'b', dueDate: '2026-09-21' })];
    expect(todosForDate(todos, '2026-09-21', today, 's1').map((t) => t.id)).toEqual(['a']);
  });
});
