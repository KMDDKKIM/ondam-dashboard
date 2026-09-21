import Link from 'next/link';

export default function AppNotFound() {
  return (
    <div className="card" style={{ padding: 28, maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>페이지를 찾을 수 없어요</h2>
      <p className="muted-text" style={{ margin: '0 0 20px', lineHeight: 1.6 }}>
        주소가 바뀌었거나 없어진 화면이에요. 홈에서 다시 찾아 주세요.
      </p>
      <Link href="/" className="btn-primary" style={{ display: 'inline-block', padding: '8px 18px', fontSize: 14, textDecoration: 'none' }}>
        홈으로
      </Link>
    </div>
  );
}
