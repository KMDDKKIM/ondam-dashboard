'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  createReceptionRecord,
  deleteReceptionRecord,
  listReceptionRecords,
  updateReceptionRecord,
  type ReceptionRecordPatch,
} from '@/lib/supabase/receptionRecords';
import {
  PAYMENTS,
  VISIT_KINDS,
  formatFee,
  formatLogHeader,
  normalizeBirth,
  parseFee,
  summarize,
  type ReceptionPayment,
  type ReceptionRecord,
  type ReceptionVisitKind,
} from '@/lib/receptionLog';
import { addDaysKst, todayKst } from '@/lib/kst';

const cellStyle = { border: '1px solid #ddd', padding: 4, fontSize: 14 } as const;
const inputStyle = { fontSize: 14, padding: 4, width: '100%', border: 'none', background: 'transparent' } as const;
const selectStyle = { fontSize: 14, padding: 2, width: '100%' } as const;
const navButtonStyle = { padding: '6px 12px', borderRadius: 8, border: '1px solid var(--color-line)', background: 'var(--color-surface)', fontSize: 14, fontWeight: 600 } as const;

const KIND_OPTIONS: { value: ReceptionVisitKind; label: string }[] = VISIT_KINDS.map((k) => ({ value: k, label: k }));

function emptyDraft() {
  return {
    visitKind: '재진' as ReceptionVisitKind,
    patientName: '',
    birthDate: '',
    treatment: '',
    fee: '',
    payment: null as ReceptionPayment | null,
    reserved: false,
    note: '',
  };
}

function PaymentPicker({ value, onChange }: { value: ReceptionPayment | null; onChange: (v: ReceptionPayment | null) => void }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {PAYMENTS.map((p) => {
        const on = value === p;
        return (
          <button
            key={p}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : p)}
            style={{
              flex: 1,
              padding: '4px 0',
              fontSize: 13,
              fontWeight: on ? 700 : 500,
              borderRadius: 6,
              border: `1px solid ${on ? 'var(--color-brand-b)' : '#ddd'}`,
              background: on ? 'var(--color-brand-b)' : '#fff',
              color: on ? '#fff' : '#555',
            }}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

export default function ReceptionLogPage() {
  const supabase = useMemo(() => createClient(), []);
  const [date, setDate] = useState(todayKst());
  const [records, setRecords] = useState<ReceptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const loadToken = useRef(0);

  const load = useCallback(
    async (target: string) => {
      const token = ++loadToken.current;
      setLoading(true);
      try {
        const list = await listReceptionRecords(supabase, target);
        if (token !== loadToken.current) return; // 그 사이 다른 날짜로 넘어갔다
        setRecords(list);
        setError('');
      } catch {
        if (token !== loadToken.current) return;
        setError('접수기록을 불러오지 못했어요. (접수기록부 테이블이 아직 없다면 안내드린 SQL을 먼저 실행해 주세요)');
      } finally {
        if (token === loadToken.current) setLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    load(date);
  }, [date, load]);

  const summary = useMemo(() => summarize(records), [records]);
  const maxSeq = records.reduce((m, r) => Math.max(m, r.seq), 0);

  function patchLocal(id: string, patch: ReceptionRecordPatch) {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save(id: string, patch: ReceptionRecordPatch) {
    try {
      await updateReceptionRecord(supabase, id, patch);
      patchLocal(id, patch);
      setError('');
    } catch {
      setError('저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      load(date);
    }
  }

  async function saveText(r: ReceptionRecord, field: 'treatment' | 'note', value: string) {
    const next = value.trim() || null;
    if (next === (r[field] ?? null)) return;
    await save(r.id, { [field]: next });
  }

  async function saveName(r: ReceptionRecord, value: string, input: HTMLInputElement) {
    const name = value.trim();
    if (!name) {
      input.value = r.patientName; // 성명은 비울 수 없다
      return;
    }
    if (name !== r.patientName) await save(r.id, { patientName: name });
  }

  async function saveBirth(r: ReceptionRecord, value: string, input: HTMLInputElement) {
    const next = normalizeBirth(value);
    input.value = next ?? '';
    if (next !== (r.birthDate ?? null)) await save(r.id, { birthDate: next });
  }

  async function saveFee(r: ReceptionRecord, value: string, input: HTMLInputElement) {
    const next = parseFee(value);
    if (value.trim() !== '' && next === null) {
      input.value = formatFee(r.fee); // 숫자가 아니면 원래 값으로
      return;
    }
    input.value = formatFee(next);
    if (next !== r.fee) await save(r.id, { fee: next });
  }

  async function handleDelete(r: ReceptionRecord, index: number) {
    if (!window.confirm(`${index + 1}번 ${r.patientName} 줄을 삭제할까요?`)) return;
    try {
      await deleteReceptionRecord(supabase, r.id);
      setRecords((prev) => prev.filter((x) => x.id !== r.id));
    } catch {
      setError('삭제하지 못했어요.');
      load(date);
    }
  }

  const draftReady = draft.patientName.trim() !== '';
  const feeInvalid = draft.fee.trim() !== '' && parseFee(draft.fee) === null;

  async function commitDraft() {
    if (!draftReady || feeInvalid || saving) return;
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const created = await createReceptionRecord(
        supabase,
        {
          visitDate: date,
          visitKind: draft.visitKind,
          patientName: draft.patientName.trim(),
          birthDate: normalizeBirth(draft.birthDate),
          treatment: draft.treatment.trim() || null,
          fee: parseFee(draft.fee),
          payment: draft.payment,
          reserved: draft.reserved,
          note: draft.note.trim() || null,
          createdBy: user?.id ?? null,
        },
        maxSeq
      );
      setRecords((prev) => [...prev, created]);
      setDraft(emptyDraft());
      setError('');
      nameRef.current?.focus();
    } catch {
      setError('등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  const enterToCommit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitDraft();
  };

  const isToday = date === todayKst();

  return (
    <div>
      <h1 style={{ marginBottom: 12 }}>접수기록부</h1>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" onClick={() => setDate((d) => addDaysKst(d, -1))} style={navButtonStyle} aria-label="전날">
          ◀
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          style={{ fontSize: 14, padding: 5, borderRadius: 8, border: '1px solid var(--color-line)' }}
        />
        <button type="button" onClick={() => setDate((d) => addDaysKst(d, 1))} style={navButtonStyle} aria-label="다음날">
          ▶
        </button>
        {!isToday && (
          <button type="button" onClick={() => setDate(todayKst())} style={navButtonStyle}>
            오늘
          </button>
        )}
        <span style={{ fontSize: 20, fontWeight: 800, marginLeft: 6 }}>{formatLogHeader(date)}</span>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 8 }}>{error}</p>}

      <div className="card" style={{ padding: 10, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: 880 }}>
          <colgroup>
            <col style={{ width: 46 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 62 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 92 }} />
            <col style={{ width: 170 }} />
            <col style={{ width: 92 }} />
            <col style={{ width: 150 }} />
            <col />
            <col style={{ width: 54 }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              {['예약', '번호', '구분', '성명', '생년월일', '치료내역', '진료비', '결제', '비고', ''].map((h, i) => (
                <th key={`${h}-${i}`} style={{ ...cellStyle, textAlign: i === 0 || i === 1 ? 'center' : 'left', fontSize: 13 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={r.id}>
                <td style={{ ...cellStyle, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={r.reserved}
                    onChange={(e) => save(r.id, { reserved: e.target.checked })}
                    aria-label={`${r.patientName} 예약 여부`}
                    style={{ width: 18, height: 18 }}
                  />
                </td>
                <td style={{ ...cellStyle, textAlign: 'center', color: '#666' }}>{i + 1}</td>
                <td style={cellStyle}>
                  <select value={r.visitKind} onChange={(e) => save(r.id, { visitKind: e.target.value as ReceptionVisitKind })} style={selectStyle}>
                    {KIND_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={cellStyle}>
                  <input defaultValue={r.patientName} onBlur={(e) => saveName(r, e.target.value, e.target)} style={{ ...inputStyle, fontWeight: 600 }} />
                </td>
                <td style={cellStyle}>
                  <input defaultValue={r.birthDate ?? ''} onBlur={(e) => saveBirth(r, e.target.value, e.target)} style={inputStyle} />
                </td>
                <td style={cellStyle}>
                  <input defaultValue={r.treatment ?? ''} title={r.treatment ?? ''} onBlur={(e) => saveText(r, 'treatment', e.target.value)} style={inputStyle} />
                </td>
                <td style={cellStyle}>
                  <input
                    defaultValue={formatFee(r.fee)}
                    inputMode="numeric"
                    onBlur={(e) => saveFee(r, e.target.value, e.target)}
                    style={{ ...inputStyle, textAlign: 'right' }}
                  />
                </td>
                <td style={cellStyle}>
                  <PaymentPicker value={r.payment} onChange={(v) => save(r.id, { payment: v })} />
                </td>
                <td style={cellStyle}>
                  <input defaultValue={r.note ?? ''} title={r.note ?? ''} onBlur={(e) => saveText(r, 'note', e.target.value)} style={inputStyle} />
                </td>
                <td style={cellStyle}>
                  <button type="button" onClick={() => handleDelete(r, i)} style={{ fontSize: 12, padding: '2px 6px', color: '#b3261e' }}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}

            {/* 새 접수 줄 — 성명만 있으면 Enter 또는 "추가"로 저장된다. */}
            <tr style={{ background: '#fafdf9' }}>
              <td style={{ ...cellStyle, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={draft.reserved}
                  onChange={(e) => setDraft((d) => ({ ...d, reserved: e.target.checked }))}
                  aria-label="예약 여부"
                  style={{ width: 18, height: 18 }}
                />
              </td>
              <td style={{ ...cellStyle, textAlign: 'center', color: '#999' }}>{records.length + 1}</td>
              <td style={cellStyle}>
                <select value={draft.visitKind} onChange={(e) => setDraft((d) => ({ ...d, visitKind: e.target.value as ReceptionVisitKind }))} style={selectStyle}>
                  {KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </td>
              <td style={cellStyle}>
                <input
                  ref={nameRef}
                  value={draft.patientName}
                  onChange={(e) => setDraft((d) => ({ ...d, patientName: e.target.value }))}
                  onKeyDown={enterToCommit}
                  placeholder="+ 성명"
                  style={inputStyle}
                />
              </td>
              <td style={cellStyle}>
                <input value={draft.birthDate} onChange={(e) => setDraft((d) => ({ ...d, birthDate: e.target.value }))} onKeyDown={enterToCommit} placeholder="44.6.30" style={inputStyle} />
              </td>
              <td style={cellStyle}>
                <input value={draft.treatment} onChange={(e) => setDraft((d) => ({ ...d, treatment: e.target.value }))} onKeyDown={enterToCommit} placeholder="치료내역" style={inputStyle} />
              </td>
              <td style={cellStyle}>
                <input
                  value={draft.fee}
                  inputMode="numeric"
                  onChange={(e) => setDraft((d) => ({ ...d, fee: e.target.value }))}
                  onKeyDown={enterToCommit}
                  placeholder="진료비"
                  style={{ ...inputStyle, textAlign: 'right', color: feeInvalid ? '#b3261e' : undefined }}
                />
              </td>
              <td style={cellStyle}>
                <PaymentPicker value={draft.payment} onChange={(v) => setDraft((d) => ({ ...d, payment: v }))} />
              </td>
              <td style={cellStyle}>
                <input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} onKeyDown={enterToCommit} placeholder="비고" style={inputStyle} />
              </td>
              <td style={cellStyle}>
                <button type="button" onClick={commitDraft} disabled={!draftReady || feeInvalid || saving} style={{ fontSize: 13, padding: '3px 8px', fontWeight: 700 }}>
                  추가
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        {loading && <p className="muted-text" style={{ marginTop: 8, fontSize: 13 }}>불러오는 중…</p>}
        <p className="muted-text" style={{ marginTop: 8, fontSize: 12 }}>
          성명만 적고 Enter를 누르면 추가돼요. 예약 칸의 체크는 종이 접수 노트의 번호 왼쪽 체크(다음 예약을 잡았는지)예요. 구분은 초(초진) · 재초(재초진) · 재진 중에서 골라요.
        </p>
      </div>

      <div className="card" style={{ padding: 12, marginTop: 12, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 14 }}>
        <span>
          접수 <b>{summary.count}</b>명 (초진 {summary.firstVisitCount})
        </span>
        <span>
          예약 <b>{summary.reservedCount}</b>/{summary.count}
        </span>
        <span>
          진료비 합계 <b>{formatFee(summary.feeTotal) || 0}</b>원
        </span>
        <span>현금 {formatFee(summary.cash) || 0}</span>
        <span>카드 {formatFee(summary.card) || 0}</span>
        <span>미수 {formatFee(summary.unpaid) || 0}</span>
        {summary.paymentMissing > 0 && (
          <span style={{ color: '#b3261e', fontWeight: 600 }}>결제 방법 안 고른 줄 {summary.paymentMissing}건</span>
        )}
      </div>
    </div>
  );
}
