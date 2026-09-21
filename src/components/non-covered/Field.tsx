import type { CSSProperties, ReactNode } from 'react';

// 비급여 등록·수정 폼의 "이름표 + 입력칸" 한 덩어리. 글자를 크게, 이름표는 늘 위에 보이게 한다.
export function Field({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <label style={{ display: 'block', ...style }}>
      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--color-muted)', marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}

/** 입력칸들을 화면 폭에 맞춰 줄바꿈하며 나란히 놓는다. */
export const fieldGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  gap: 14,
  marginBottom: 14,
};

/** 입력칸 공통 모양(폼 안에서 크게). */
export const inputBig: CSSProperties = { fontSize: 15, padding: '10px 12px', width: '100%' };
