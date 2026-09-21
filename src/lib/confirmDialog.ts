// 화면 안에서 뜨는 확인 창. 브라우저 기본 확인 창(window.confirm)은 Claude 데스크톱 앱의 브라우저 창처럼
// 확인 창을 막는 환경에서 아무 화면도 없이 곧바로 "취소"로 처리돼서, 저장·삭제 버튼이 아무 말 없이 안 눌린 것처럼 보였다.
// 그래서 확인이 필요한 곳은 모두 이 함수를 쓴다: `if (!(await confirmDialog('삭제할까요?'))) return;`
// (ConfirmHost 가 화면에 떠 있지 않으면 예전처럼 window.confirm 으로 물어본다.)

export interface ConfirmRequest {
  message: string;
  confirmLabel: string;
  resolve: (ok: boolean) => void;
}

export const CONFIRM_EVENT = 'ondam:confirm';

let hostMounted = false;

export function setConfirmHostMounted(mounted: boolean): void {
  hostMounted = mounted;
}

export function confirmDialog(message: string, options: { confirmLabel?: string } = {}): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    if (!hostMounted) {
      resolve(window.confirm(message));
      return;
    }
    const detail: ConfirmRequest = { message, confirmLabel: options.confirmLabel ?? '확인', resolve };
    window.dispatchEvent(new CustomEvent<ConfirmRequest>(CONFIRM_EVENT, { detail }));
  });
}
