// 표의 입력칸에서 방향키로 옆·위·아래 칸으로 옮겨 가는 규칙(한약 처방전 약재 목록, 원장 요청 2026-10-26).
// 위·아래는 늘 칸을 옮기고, 왼쪽·오른쪽은 글자 커서가 칸의 맨 앞·맨 뒤에 있을 때만 옮긴다(글자 사이에서는 커서가 평소처럼 움직인다).
// 칸 끝을 넘어서는 방향(첫 줄에서 위, 마지막 줄에서 아래 등)은 옮기지 않는다.

export interface GridCell {
  row: number;
  col: number;
}

export interface GridMove {
  /** 옮겨 갈 칸(없으면 null) */
  target: GridCell | null;
  /** 브라우저 기본 동작(숫자칸의 값 증감 등)을 막을지 */
  preventDefault: boolean;
}

export function gridArrowMove(key: string, cell: GridCell, rowCount: number, colCount: number, caret: { atStart: boolean; atEnd: boolean }): GridMove | null {
  const none: GridMove = { target: null, preventDefault: false };
  switch (key) {
    case 'ArrowUp':
      // 위아래는 숫자칸의 값이 바뀌는 기본 동작도 함께 막는다.
      return { target: cell.row > 0 ? { row: cell.row - 1, col: cell.col } : null, preventDefault: true };
    case 'ArrowDown':
      return { target: cell.row + 1 < rowCount ? { row: cell.row + 1, col: cell.col } : null, preventDefault: true };
    case 'ArrowLeft':
      if (!caret.atStart || cell.col === 0) return none;
      return { target: { row: cell.row, col: cell.col - 1 }, preventDefault: true };
    case 'ArrowRight':
      if (!caret.atEnd || cell.col + 1 >= colCount) return none;
      return { target: { row: cell.row, col: cell.col + 1 }, preventDefault: true };
    default:
      return null;
  }
}
