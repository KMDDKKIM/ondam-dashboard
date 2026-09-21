// 붙여넣기 화면의 칸(일일결산·예약 명단·월결산)이 저장 결과 문구를 지우는 규칙.
// 다른 칸을 저장하면 이 칸에 남은 "예전 성공 문구"는 지우지만, 사용자가 무언가 다시 눌러야 하는 오류는 남긴다.

/** 결산은 저장했지만 내원 환자 명단 저장이 실패했을 때 — 같은 결산표로 일일결산을 다시 저장할 때까지 남는다. */
export const VISITS_NOT_SAVED_ERROR = '결산은 저장했지만 내원 환자 명단을 저장하지 못했어요. 같은 결산표로 저장을 한 번 더 눌러 주세요.';

const ACTION_REQUIRED_ERRORS: readonly string[] = [VISITS_NOT_SAVED_ERROR];

/** 이 오류는 사용자가 다시 저장해야 없어지므로 다른 칸의 저장으로 지우면 안 된다. */
export function isActionRequiredError(error: string): boolean {
  return ACTION_REQUIRED_ERRORS.includes(error);
}

/** 다른 칸을 저장했을 때 남길 오류 문구: 다시 저장해야 하는 오류만 그대로, 나머지는 비운다. */
export function errorAfterOtherSectionSaved(error: string): string {
  return isActionRequiredError(error) ? error : '';
}
