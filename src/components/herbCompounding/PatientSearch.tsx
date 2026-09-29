'use client';

import { useState } from 'react';
import type { KnownHerbPatient } from '@/lib/supabase/herbCompounding';

interface Props {
  value: string;
  onChange: (name: string) => void;
  knownPatients: KnownHerbPatient[];
  onPick: (patient: KnownHerbPatient) => void;
}

// 환자명 칸 자체가 검색칸이다 — 전에 이 화면에서 저장한 적 있는 이름을 치면 아래에 후보로
// 보여주고, 눌러서 고르면 차트번호까지 같이 채운다. 동명이인은 차트번호가 다르면 따로
// 뜬다. 후보를 안 누르고 계속 입력하면 그냥 새 환자로 저장된다(원장 요청, 2026-09-29).
export function PatientSearch({ value, onChange, knownPatients, onPick }: Props) {
  const [open, setOpen] = useState(false);

  const q = value.trim();
  const matches = open && q ? knownPatients.filter((p) => p.patientName.includes(q)).slice(0, 8) : [];

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input-field"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="홍길동"
        autoComplete="off"
      />
      {matches.length > 0 && (
        <div
          className="card"
          style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 4, maxHeight: 200, overflowY: 'auto' }}
        >
          {matches.map((p, i) => (
            <button
              key={`${p.patientName}-${p.chartNo}-${i}`}
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
              <strong>{p.patientName}</strong> <span className="muted-text">{p.chartNo || '차트번호 없음'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
