'use client';

import { useMemo, useState } from 'react';
import type { KnownPatient } from '@/lib/supabase/nonCoveredPurchases';

interface Props {
  knownPatients: KnownPatient[];
  onPick: (patient: KnownPatient) => void;
}

// 기존 구매 기록에서 이름/차트번호/연락처로 환자를 찾아 누르면 폼에 자동 입력한다.
export function PatientSearch({ knownPatients, onPick }: Props) {
  const [search, setSearch] = useState('');

  const matches = useMemo(() => {
    const q = search.trim();
    if (!q) return [];
    return knownPatients
      .filter((p) => p.patientName.includes(q) || p.chartNo.includes(q) || (p.phone ?? '').includes(q))
      .slice(0, 8);
  }, [search, knownPatients]);

  return (
    <div style={{ position: 'relative', marginBottom: 10 }}>
      <input
        placeholder="환자 검색 (이름/차트번호/연락처) — 있으면 눌러서 자동 입력"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input-field"
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
              onClick={() => {
                onPick(p);
                setSearch('');
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
