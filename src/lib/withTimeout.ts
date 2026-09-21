/**
 * promise 가 ms 안에 끝나지 않으면 null 로 돌려준다(원래 작업은 멈추지 않고 결과만 버려진다).
 * 조회에 실패(reject)해도 null — 화면이 느린/실패한 조회 하나 때문에 계속 기다리지 않게 한다.
 */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}
