'use client';

import { useState } from 'react';
import { dietPillStartDate, medicineEndDate, phaseLabel, TRACK_LABEL, type DietProgram, type DietTrack } from '@/lib/dietProgram';
import { koDate } from '@/lib/dietScripts';
import { todayKst } from '@/lib/kst';
import type { ProgramPatch } from '@/lib/supabase/dietPrograms';

const labelStyle = { display: 'block', fontSize: 11, color: 'var(--color-muted)', marginBottom: 2 } as const;
const inputStyle = { width: '100%', fontSize: 13, padding: '3px 5px' } as const;

function DateField({ label, value, hint, onSave }: { label: string; value: string | null; hint?: string; onSave: (v: string) => void }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="date" className="input-field" style={inputStyle} value={value ?? ''} onChange={(e) => onSave(e.target.value)} />
      {hint && <div className="muted-text" style={{ fontSize: 11, marginTop: 1 }}>{hint}</div>}
    </div>
  );
}

// 린다이어트 환자 1명의 프로그램 카드 — 데스크가 단계마다 날짜를 채우면 원장 카톡 일정(케어 보드)이 자동으로 계산된다.
export function DietProgramCard({ program, onChange, onDelete }: { program: DietProgram; onChange: (id: string, patch: ProgramPatch) => Promise<void>; onDelete: (program: DietProgram) => void }) {
  const today = todayKst();
  const [memo, setMemo] = useState(program.memo);
  const [busy, setBusy] = useState(false);
  const pillStart = dietPillStartDate(program);
  const computedEnd = medicineEndDate(program);
  const ended = program.status === 'ended';

  async function save(patch: ProgramPatch) {
    setBusy(true);
    try {
      await onChange(program.id, patch);
    } finally {
      setBusy(false);
    }
  }
  const quick = (label: string, patch: ProgramPatch, done?: boolean) => (
    <button type="button" disabled={busy || done} onClick={() => save(patch)} style={{ fontSize: 12, padding: '3px 9px' }}>
      {done ? `✓ ${label}` : label}
    </button>
  );

  return (
    <div className="card" style={{ padding: 12, marginBottom: 10, opacity: ended ? 0.7 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>{program.patientName}</span>
        <select
          value={program.track}
          onChange={(e) => save({ track: e.target.value as DietTrack })}
          style={{ fontSize: 12, padding: '1px 4px' }}
          aria-label={`${program.patientName} 진료방식`}
        >
          <option value="visit">{TRACK_LABEL.visit}</option>
          <option value="remote">{TRACK_LABEL.remote}</option>
        </select>
        <span style={{ fontWeight: 700, color: ended ? 'var(--color-muted)' : 'var(--color-teal-deep)' }}>{phaseLabel(program, today)}</span>
        {program.phone && <span className="muted-text" style={{ fontSize: 12 }}>{program.phone}</span>}
        {program.lastDoctorContactDate && <span className="muted-text" style={{ fontSize: 12 }}>마지막 원장 연락 {koDate(program.lastDoctorContactDate)}</span>}
        <span style={{ flex: 1 }} />
        {!ended ? (
          <button type="button" disabled={busy} onClick={() => save({ status: 'ended', endedAt: today })} style={{ fontSize: 12, padding: '3px 9px' }}>
            종료 처리
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => save({ status: 'active', endedAt: '' })} style={{ fontSize: 12, padding: '3px 9px' }}>
            다시 진행
          </button>
        )}
        <button type="button" onClick={() => onDelete(program)} style={{ fontSize: 12, padding: '3px 9px', color: '#b3261e' }}>
          삭제
        </button>
      </div>

      {!ended && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {quick('결제 확인(오늘)', { paidAt: today }, program.paidAt === today)}
          {quick('발송 완료(오늘)', { shippedAt: today }, program.shippedAt === today)}
          {quick('오늘 기록 확인', { lastRecordDate: today }, program.lastRecordDate === today)}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: 8 }}>
        <DateField label={program.track === 'visit' ? '초진일' : '첫 상담일'} value={program.firstDate} onSave={(v) => save({ firstDate: v })} />
        <DateField label="결제 확인일" value={program.paidAt} onSave={(v) => save({ paidAt: v })} />
        <DateField label="발송일(택배)" value={program.shippedAt} onSave={(v) => save({ shippedAt: v })} />
        <DateField label="디톡스 시작일" value={program.detoxStartDate} hint={pillStart ? `다이어트환 시작 ${koDate(pillStart)}` : undefined} onSave={(v) => save({ detoxStartDate: v })} />
        <div>
          <label style={labelStyle}>디톡스 일수</label>
          <input type="number" min={1} className="input-field" style={inputStyle} value={program.detoxDays} onChange={(e) => save({ detoxDays: Math.max(1, Number(e.target.value) || 3) })} />
        </div>
        <div>
          <label style={labelStyle}>프로그램 주수</label>
          <input type="number" min={1} className="input-field" style={inputStyle} value={program.weeks ?? ''} onChange={(e) => save({ weeks: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <DateField
          label="약 소진 예정일"
          value={program.medicineEndDate}
          hint={!program.medicineEndDate && computedEnd ? `비우면 자동: ${koDate(computedEnd)}` : undefined}
          onSave={(v) => save({ medicineEndDate: v })}
        />
        <DateField label={program.track === 'visit' ? '재진일' : '2차 상담일'} value={program.revisitDate} onSave={(v) => save({ revisitDate: v })} />
        <DateField label="마지막 기록일" value={program.lastRecordDate} onSave={(v) => save({ lastRecordDate: v })} />
      </div>

      <div style={{ marginTop: 8 }}>
        <label style={labelStyle}>메모</label>
        <input
          className="input-field"
          style={{ ...inputStyle, fontSize: 13 }}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onBlur={() => {
            if (memo !== program.memo) void save({ memo });
          }}
          placeholder="예: 목표 8kg, 저녁 약속 많음"
        />
      </div>
    </div>
  );
}
