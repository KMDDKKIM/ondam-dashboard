import { describe, expect, it } from 'vitest';
import { gridArrowMove } from './gridNav';

const mid = { atStart: false, atEnd: false };
const both = { atStart: true, atEnd: true };

describe('gridArrowMove', () => {
  it('위·아래는 같은 칸 번호로 한 줄씩 옮기고 기본 동작을 막는다', () => {
    expect(gridArrowMove('ArrowDown', { row: 1, col: 2 }, 5, 3, mid)).toEqual({ target: { row: 2, col: 2 }, preventDefault: true });
    expect(gridArrowMove('ArrowUp', { row: 1, col: 2 }, 5, 3, mid)).toEqual({ target: { row: 0, col: 2 }, preventDefault: true });
  });

  it('첫 줄의 위·마지막 줄의 아래는 옮기지 않지만 숫자 증감은 막는다', () => {
    expect(gridArrowMove('ArrowUp', { row: 0, col: 2 }, 5, 3, mid)).toEqual({ target: null, preventDefault: true });
    expect(gridArrowMove('ArrowDown', { row: 4, col: 2 }, 5, 3, mid)).toEqual({ target: null, preventDefault: true });
  });

  it('왼쪽·오른쪽은 커서가 맨 앞·맨 뒤일 때만 옮긴다', () => {
    expect(gridArrowMove('ArrowLeft', { row: 0, col: 1 }, 5, 3, mid)).toEqual({ target: null, preventDefault: false });
    expect(gridArrowMove('ArrowLeft', { row: 0, col: 1 }, 5, 3, { atStart: true, atEnd: false })).toEqual({ target: { row: 0, col: 0 }, preventDefault: true });
    expect(gridArrowMove('ArrowRight', { row: 0, col: 1 }, 5, 3, { atStart: false, atEnd: true })).toEqual({ target: { row: 0, col: 2 }, preventDefault: true });
    expect(gridArrowMove('ArrowRight', { row: 0, col: 1 }, 5, 3, { atStart: true, atEnd: false })).toEqual({ target: null, preventDefault: false });
  });

  it('칸 끝에서는 옆으로 더 옮기지 않고 커서를 그대로 둔다', () => {
    expect(gridArrowMove('ArrowLeft', { row: 0, col: 0 }, 5, 3, both)).toEqual({ target: null, preventDefault: false });
    expect(gridArrowMove('ArrowRight', { row: 0, col: 2 }, 5, 3, both)).toEqual({ target: null, preventDefault: false });
  });

  it('방향키가 아니면 null', () => {
    expect(gridArrowMove('Enter', { row: 0, col: 0 }, 5, 3, both)).toBeNull();
  });
});
