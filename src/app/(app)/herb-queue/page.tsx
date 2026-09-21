'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  createHerbQueueItem,
  currentStaff,
  deleteHerbQueueItem,
  listHerbQueue,
  markHerbQueueDone,
  undoHerbQueueDone,
  updateHerbQueueItem,
  type HerbQueueEdit,
} from '@/lib/supabase/herbQueue';
import { doctorsAsStaffList, listDoctors, type Doctor } from '@/lib/supabase/doctors';
import { formatQueueTime, missingFields, sortDone, sortWaiting, type HerbQueueDraft, type HerbQueueItem } from '@/lib/herbQueue';
import { addDaysKst, todayKst } from '@/lib/kst';

const cellStyle = { border: '1px solid #ddd', padding: '3px 5px', fontSize: 14 } as const;
const inputStyle = { fontSize: 14, padding: '3px 4px', width: '100%', border: 'none', background: 'transparent' } as const;
const selectStyle = { fontSize: 14, padding: 2, width: '100%' } as const;
const REFRESH_MS = 30_000;
const DONE_DAYS = 7;

function emptyDraft(): HerbQueueDraft {
  return { patientName: '', chartNo: '', doctorName: '', herbDesc: '', note: '' };
}

export default function HerbQueuePage() {
  const supabase = useMemo(() => createClient(), []);
  const [waiting, setWaiting] = useState<HerbQueueItem[]>([]);
  const [done, setDone] = useState<HerbQueueItem[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [draft, setDraft] = useState<HerbQueueDraft>(emptyDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showDone, setShowDone] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const editing = useRef(0); // 칸을 고치는 중에는 자동 새로고침이 입력을 덮어쓰지 않게 한다

  const doctorNames = useMemo(() => doctorsAsStaffList(doctors).map((d) => d.name), [doctors]);

  const load = useCallback(async () => {
    try {
      const since = new Date(`${addDaysKst(todayKst(), -DONE_DAYS)}T00:00:00+09:00`).toISOString();
      const result = await listHerbQueue(supabase, since);
      setWaiting(sortWaiting(result.waiting));
      setDone(sortDone(result.done));
      setError('');
    } catch {
      setError('한약 대기 목록을 불러오지 못했어요. (한약 대기방 테이블이 아직 없다면 안내드린 SQL을 먼저 실행해 주세요)');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
    listDoctors(supabase).then(setDoctors).catch(() => {});
    // 다른 직원이 올린 신청이 원장님 화면에 바로 뜨도록 주기적으로, 그리고 창으로 돌아올 때 새로 불러온다.
    const timer = setInterval(() => {
      if (editing.current === 0 && document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && editing.current === 0) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, supabase]);

  const missing = missingFields(draft);
  const canSubmit = missing.length === 0 && !saving;

  async function submitDraft() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const me = await currentStaff(supabase);
      const created = await createHerbQueueItem(supabase, draft, me);
      setWaiting((prev) => sortWaiting([...prev, created]));
      // 같은 주치의로 여러 건을 올리는 일이 많아 주치의는 남겨 둔다.
      setDraft({ ...emptyDraft(), doctorName: draft.doctorName });
      setError('');
      nameRef.current?.focus();
    } catch {
      setError('신청하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  async function edit(item: HerbQueueItem, patch: HerbQueueEdit) {
    try {
      await updateHerbQueueItem(supabase, item.id, patch);
      setWaiting((prev) => prev.map((w) => (w.id === item.id ? { ...w, ...patch } : w)));
      setError('');
    } catch {
      setError('저장하지 못했어요.');
      load();
    }
  }

  async function editText(item: HerbQueueItem, field: 'patientName' | 'chartNo' | 'herbDesc' | 'note', value: string, input: HTMLInputElement) {
    editing.current = Math.max(0, editing.current - 1);
    const next = value.trim();
    if (field === 'patientName' && !next) {
      input.value = item.patientName; // 환자 성함은 비울 수 없다
      return;
    }
    if (field === 'herbDesc' && !next) {
      input.value = item.herbDesc;
      return;
    }
    if (next === item[field]) return;
    await edit(item, { [field]: next });
  }

  async function handleDone(item: HerbQueueItem) {
    try {
      const me = await currentStaff(supabase);
      const doneAt = await markHerbQueueDone(supabase, item.id, me);
      setWaiting((prev) => prev.filter((w) => w.id !== item.id));
      setDone((prev) => sortDone([{ ...item, status: 'done', doneAt, doneByName: me.name }, ...prev]));
      setError('');
    } catch (err) {
      setError(err instanceof Error && err.message.includes('이미') ? '다른 분이 먼저 완료했어요.' : '완료 처리하지 못했어요.');
      load();
    }
  }

  async function handleUndo(item: HerbQueueItem) {
    try {
      await undoHerbQueueDone(supabase, item.id);
      await load();
    } catch {
      setError('되돌리지 못했어요.');
    }
  }

  async function handleDelete(item: HerbQueueItem) {
    if (!window.confirm(`${item.patientName}님 한약 신청을 삭제할까요?`)) return;
    try {
      await deleteHerbQueueItem(supabase, item.id);
      setWaiting((prev) => prev.filter((w) => w.id !== item.id));
      setDone((prev) => prev.filter((w) => w.id !== item.id));
    } catch {
      setError('삭제하지 못했어요.');
      load();
    }
  }

  const enterToSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submitDraft();
  };

  const trackFocus = { onFocus: () => (editing.current += 1) } as const;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1>한약 처방 대기 현황</h1>
        <span style={{ fontWeight: 700, color: waiting.length > 0 ? 'var(--color-error)' : 'var(--color-muted)' }}>
          대기 {waiting.length}건
        </span>
        <Link href="/herb-print" style={{ fontSize: 13, marginLeft: 'auto', color: 'var(--color-brand-b)', fontWeight: 600 }}>
          한약 복용법 출력하러 가기 →
        </Link>
      </div>
      <p className="muted-text" style={{ marginBottom: 14, fontSize: 13 }}>
        직원이 처방을 신청하면 원장님이 이 목록을 보고 복용법을 출력한 뒤 &quot;완료&quot;를 눌러요. 다른 직원이 올린 신청은 30초마다 자동으로 나타나요.
      </p>

      {error && <p className="error-text" style={{ marginBottom: 8 }}>{error}</p>}

      <div className="card" style={{ padding: 10, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: 900 }}>
          <colgroup>
            <col style={{ width: 92 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 200 }} />
            <col />
            <col style={{ width: 70 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#e4f0e2' }}>
              {['신청 시각', '환자 성함', '차트번호', '주치의', '한약/횟차', '전달사항', '신청자', ''].map((h, i) => (
                <th key={`${h}-${i}`} style={{ ...cellStyle, textAlign: 'center', fontSize: 13 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {waiting.map((w) => (
              <tr key={w.id}>
                <td style={{ ...cellStyle, textAlign: 'center', color: '#666', fontSize: 12 }}>{formatQueueTime(w.createdAt)}</td>
                <td style={cellStyle}>
                  <input defaultValue={w.patientName} {...trackFocus} onBlur={(e) => editText(w, 'patientName', e.target.value, e.target)} style={{ ...inputStyle, fontWeight: 600, textAlign: 'center' }} />
                </td>
                <td style={cellStyle}>
                  <input defaultValue={w.chartNo} {...trackFocus} onBlur={(e) => editText(w, 'chartNo', e.target.value, e.target)} style={{ ...inputStyle, textAlign: 'center' }} />
                </td>
                <td style={cellStyle}>
                  <select value={w.doctorName} onChange={(e) => edit(w, { doctorName: e.target.value })} style={selectStyle}>
                    {!doctorNames.includes(w.doctorName) && <option value={w.doctorName}>{w.doctorName || '주치의'}</option>}
                    {doctorNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={cellStyle}>
                  <input defaultValue={w.herbDesc} title={w.herbDesc} {...trackFocus} onBlur={(e) => editText(w, 'herbDesc', e.target.value, e.target)} style={inputStyle} />
                </td>
                <td style={cellStyle}>
                  <input defaultValue={w.note} title={w.note} {...trackFocus} onBlur={(e) => editText(w, 'note', e.target.value, e.target)} style={inputStyle} />
                </td>
                <td style={{ ...cellStyle, textAlign: 'center', fontSize: 12, color: '#666' }}>{w.requestedByName || '-'}</td>
                <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => handleDone(w)} className="btn-primary" style={{ padding: '3px 12px', fontSize: 13 }}>
                    완료
                  </button>{' '}
                  <button type="button" onClick={() => handleDelete(w)} style={{ fontSize: 12, padding: '2px 6px', color: '#b3261e', whiteSpace: 'nowrap' }}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}

            {/* 새 신청 줄 — 환자 성함·주치의·한약/횟차를 적고 Enter 또는 "신청"을 누르면 대기 목록에 올라간다. */}
            <tr style={{ background: '#fafdf9' }}>
              <td style={{ ...cellStyle, textAlign: 'center', color: '#999', fontSize: 12 }}>새 신청</td>
              <td style={cellStyle}>
                <input ref={nameRef} value={draft.patientName} onChange={(e) => setDraft((d) => ({ ...d, patientName: e.target.value }))} onKeyDown={enterToSubmit} placeholder="환자 성함" style={{ ...inputStyle, textAlign: 'center' }} />
              </td>
              <td style={cellStyle}>
                <input value={draft.chartNo} onChange={(e) => setDraft((d) => ({ ...d, chartNo: e.target.value }))} onKeyDown={enterToSubmit} placeholder="차트번호" style={{ ...inputStyle, textAlign: 'center' }} />
              </td>
              <td style={cellStyle}>
                <select value={draft.doctorName} onChange={(e) => setDraft((d) => ({ ...d, doctorName: e.target.value }))} style={selectStyle}>
                  <option value="">주치의</option>
                  {doctorNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </td>
              <td style={cellStyle}>
                <input value={draft.herbDesc} onChange={(e) => setDraft((d) => ({ ...d, herbDesc: e.target.value }))} onKeyDown={enterToSubmit} placeholder="예: 일반한약 15일" style={inputStyle} />
              </td>
              <td style={cellStyle}>
                <input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} onKeyDown={enterToSubmit} placeholder="예: (월) 오전 달여서 택배출고" style={inputStyle} />
              </td>
              <td style={cellStyle} />
              <td style={cellStyle}>
                <button
                  type="button"
                  onClick={submitDraft}
                  disabled={!canSubmit}
                  title={missing.length > 0 ? `${missing.join(', ')}을(를) 적어 주세요` : undefined}
                  style={{ fontSize: 13, padding: '3px 12px', fontWeight: 700 }}
                >
                  신청
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        {loading && <p className="muted-text" style={{ marginTop: 8, fontSize: 13 }}>불러오는 중…</p>}
        {!loading && waiting.length === 0 && !error && (
          <p className="muted-text" style={{ marginTop: 8, fontSize: 13 }}>대기 중인 한약 처방이 없어요.</p>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <button type="button" onClick={() => setShowDone((v) => !v)} style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: 14, padding: 0, color: 'var(--color-ink)' }}>
          완료한 신청 (최근 {DONE_DAYS}일 · {done.length}건) {showDone ? '▲' : '▼'}
        </button>
        {showDone && (
          <div className="card" style={{ padding: 10, marginTop: 8, overflowX: 'auto' }}>
            {done.length === 0 ? (
              <p className="muted-text" style={{ margin: 0, fontSize: 13 }}>최근 {DONE_DAYS}일 안에 완료한 신청이 없어요.</p>
            ) : (
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
                <thead>
                  <tr style={{ background: '#f0f0f0' }}>
                    {['완료 시각', '환자 성함', '차트번호', '주치의', '한약/횟차', '전달사항', '완료한 분', ''].map((h, i) => (
                      <th key={`${h}-${i}`} style={{ ...cellStyle, fontSize: 13, textAlign: 'center' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {done.map((d) => (
                    <tr key={d.id} style={{ color: '#666' }}>
                      <td style={{ ...cellStyle, textAlign: 'center', fontSize: 12 }}>{formatQueueTime(d.doneAt)}</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>{d.patientName}</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>{d.chartNo}</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>{d.doctorName}</td>
                      <td style={cellStyle}>{d.herbDesc}</td>
                      <td style={cellStyle}>{d.note}</td>
                      <td style={{ ...cellStyle, textAlign: 'center', fontSize: 12 }}>{d.doneByName || '-'}</td>
                      <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                        <button type="button" onClick={() => handleUndo(d)} style={{ fontSize: 12, padding: '2px 8px' }}>
                          되돌리기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
