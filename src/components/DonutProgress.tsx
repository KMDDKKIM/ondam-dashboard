interface DonutProgressProps {
  label: string;
  achieved: number;
  goal: number | null;
  color: string;
  size?: number;
  // 이번 달 날짜 진도 대비 상태 — 없으면 아무것도 안 붙인다. behind일 때만 부족한 건수를 적는다.
  pace?: 'behind' | 'onTrack' | null;
  shortfall?: number;
}

export function DonutProgress({ label, achieved, goal, color, size = 84, pace = null, shortfall = 0 }: DonutProgressProps) {
  const stroke = Math.round(size * 0.107);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = goal && goal > 0 ? Math.min(achieved / goal, 1) : 0;
  const offset = circumference * (1 - percentage);
  const percentLabel = goal && goal > 0 ? `${Math.round(percentage * 100)}%` : '-';
  const compact = size < 84;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: compact ? 4 : 8 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-surface-2)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.4s ease' }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: compact ? 12 : 15,
          }}
        >
          {percentLabel}
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: compact ? 12 : 13 }}>{label}</div>
        <div className="muted-text" style={{ fontSize: compact ? 11 : 12 }}>
          {achieved}
          {goal != null ? ` / ${goal}` : ''}
        </div>
        {pace && (
          <div
            style={{
              marginTop: 2,
              fontSize: compact ? 10 : 11,
              fontWeight: 700,
              color: pace === 'behind' ? 'var(--color-error)' : 'var(--color-green)',
            }}
          >
            {pace === 'behind' ? `▼ ${shortfall} 더 필요` : '✓ 순조'}
          </div>
        )}
      </div>
    </div>
  );
}
