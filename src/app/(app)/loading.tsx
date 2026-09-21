// 화면이 준비되는 동안 잠깐 보이는 가벼운 자리표시.
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-label="불러오는 중" style={{ display: 'grid', gap: 14 }}>
      <div className="skeleton" style={{ height: 28, width: 180 }} />
      <div className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>
        <div className="skeleton" style={{ height: 16, width: '40%' }} />
        <div className="skeleton" style={{ height: 14, width: '90%' }} />
        <div className="skeleton" style={{ height: 14, width: '75%' }} />
        <div className="skeleton" style={{ height: 14, width: '60%' }} />
      </div>
    </div>
  );
}
