'use client';

import { useState } from 'react';
import type { Doctor } from '@/lib/supabase/doctors';

interface Props {
  doctors: Doctor[];
}

// 진료의 목록 — 초진환자 해피콜의 진료의 선택, 통계 필터, 시트 붙여넣기가 이 목록을 쓴다.
// 대표원장·부원장 등급의 승인된 직원 계정이 곧 진료의라서 따로 추가·이름변경할 게 없다(직원 승인·등급 화면에서
// 정하면 여기 자동으로 반영된다). 여기서는 지금 누가 진료의로 잡히는지만 보여준다.
export function DoctorManager({ doctors }: Props) {
  const [open, setOpen] = useState(false);
  const active = doctors.filter((d) => d.active);

  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ border: 'none', background: 'transparent', color: 'var(--color-ink)', fontWeight: 700, fontSize: 14, padding: 0 }}
      >
        🩺 진료의 목록 ({active.length}명) {open ? '▲' : '▼'}
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <p className="muted-text" style={{ fontSize: 12, marginBottom: 10 }}>
            대표원장·부원장 등급의 승인된 직원 계정이 자동으로 진료의가 돼요. 새 부원장을 추가하거나 등급을 바꾸려면{' '}
            <a href="/staff-approval">직원 승인</a> 화면에서 하면 여기 목록도 바로 맞춰져요.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {active.map((d) => (
              <span
                key={d.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px 12px',
                  borderRadius: 999,
                  border: '1px solid var(--color-line)',
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-ink)',
                  fontSize: 13,
                }}
              >
                {d.name}
              </span>
            ))}
            {active.length === 0 && <span className="muted-text">아직 진료의가 없어요. 직원 승인 화면에서 대표원장·부원장 등급으로 승인해 주세요.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
