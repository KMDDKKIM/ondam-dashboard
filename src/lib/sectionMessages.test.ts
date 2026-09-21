import { describe, expect, it } from 'vitest';
import { errorAfterOtherSectionSaved, isActionRequiredError, VISITS_NOT_SAVED_ERROR } from './sectionMessages';

describe('errorAfterOtherSectionSaved', () => {
  it('내원 환자 명단 저장 실패는 다른 칸을 저장해도 남긴다', () => {
    expect(isActionRequiredError(VISITS_NOT_SAVED_ERROR)).toBe(true);
    expect(errorAfterOtherSectionSaved(VISITS_NOT_SAVED_ERROR)).toBe(VISITS_NOT_SAVED_ERROR);
  });
  it('그 밖의 예전 오류 문구는 지운다', () => {
    expect(errorAfterOtherSectionSaved('저장에 실패했습니다.')).toBe('');
    expect(errorAfterOtherSectionSaved('')).toBe('');
  });
});
