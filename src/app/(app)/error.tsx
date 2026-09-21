'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// 화면을 그리다 문제가 생겼을 때 보이는 안내. 왼쪽 메뉴와 위쪽 바는 그대로 남는다.
// 이 Next.js 버전은 다시 불러오며 복구하는 retry()를 권장한다(reset()은 서버 조회를 다시 하지 않는다).
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="card" style={{ padding: 28, maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>😥</div>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>화면을 불러오지 못했어요</h2>
      <p className="muted-text" style={{ margin: '0 0 20px', lineHeight: 1.6 }}>
        잠깐 문제가 생겼어요. 다시 시도해도 안 되면 홈으로 돌아가 주세요.
        {error.digest ? ` (오류 번호: ${error.digest})` : ''}
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn-primary" style={{ padding: '8px 18px', fontSize: 14 }} onClick={() => retry()}>
          다시 시도
        </button>
        <Link href="/" style={{ padding: '8px 18px', fontSize: 14, fontWeight: 600, color: 'var(--color-brand-b)', alignSelf: 'center' }}>
          홈으로
        </Link>
      </div>
    </div>
  );
}
