import { describe, expect, it } from 'vitest';
import { completedWindowStart, visibleTodos } from './todoVisibility';
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
