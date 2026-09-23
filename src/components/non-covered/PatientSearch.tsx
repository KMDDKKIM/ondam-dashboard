'use client';

import { useState, type CSSProperties } from 'react';
import type { KnownPatient } from '@/lib/supabase/nonCoveredPurchases';

interface Props {
  value: string;
  onChange: (name: string) => void;
  knownPatients: KnownPatient[];
  onPick: (patient: KnownPatient) => void;
  className?: string;
  style?: CSSProperties;
}

// 환자 성함칸 자체가 검색칸이다 — 이름(또는 차트번호)을 치면 기존 구매 기록에서 찾아 아래에
// 보여주고, 눌러서 고르면 차트번호·연락처까지 자동으로 채운다. 동명이인은 차트번호가 다르면
// 후보에 따로 뜬다(listKnownPatients가 차트번호로 구분해 둔다) — 아무 후보도 안 누르고 계속
// 입력하면 그냥 새 환자로 등록된다. 차트번호가 다르면 같은 이름이어도 별개 후보라 헷갈리지 않는다.
export function PatientSearch({ value, onChange, knownPatients, onPick, className, style }: Props) {
  const [open, setOpen] = useState(false);

  const q = value.trim();
  const matches = open && q ? knownPatients.filter((p) => p.patientName.includes(q) || p.chartNo.includes(q)).slice(0, 8) : [];

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={className}
        style={style}
        autoComplete="off"
      />
      {matches.length > 0 && (
        <div
          className="card"
          style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 4, maxHeight: 200, overflowY: 'auto' }}
        >
          {matches.map((p) => (
            <button
              key={p.chartNo}
              type="button"
              onMouseDown={(e) => e.preventDefault()} // 이 클릭이 input의 blur보다 먼저 처리되게
              onClick={() => {
                onPick(p);
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                border: 'none',
                background: 'transparent',
                color: 'var(--color-ink)',
                fontWeight: 400,
                borderBottom: '1px solid var(--color-line)',
              }}
            >
              <strong>{p.patientName}</strong>{' '}
              <span className="muted-text">
                {p.chartNo}
                {p.phone ? ` · ${p.phone}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
