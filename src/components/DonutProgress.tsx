interface DonutProgressProps {
  label: string;
  achieved: number;
  goal: number | null;
  color: string;
}

const SIZE = 84;
const STROKE = 9;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DonutProgress({ label, achieved, goal, color }: DonutProgressProps) {
  const percentage = goal && goal > 0 ? Math.min(achieved / goal, 1) : 0;
  const offset = CIRCUMFERENCE * (1 - percentage);
  const percentLabel = goal && goal > 0 ? `${Math.round(percentage * 100)}%` : '-';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-surface-2)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
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
            fontSize: 15,
          }}
        >
          {percentLabel}
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
        <div className="muted-text" style={{ fontSize: 12 }}>
          {achieved}
          {goal != null ? ` / ${goal}` : ''}
        </div>
      </div>
    </div>
  );
}
