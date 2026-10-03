// 초진환자 해피콜 표에서 초진 후 3주가 지난 환자는 기본으로 접어 두고, 필요하면 펼쳐서 본다.
import { diffDaysKst } from './kst';

/** 초진일로부터 이 일수가 지나면(= 통계에서 "성숙"으로 보는 21일) 표에서 기본으로 숨긴다. */
export const HIDE_AFTER_DAYS = 21;

export function isPastHideWindow(firstVisitDate: string, today: string): boolean {
  return diffDaysKst(firstVisitDate, today) >= HIDE_AFTER_DAYS;
}
