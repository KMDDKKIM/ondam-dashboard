'use client';

import { confirmDialog } from '@/lib/confirmDialog';
import { useState } from 'react';
import { createManualEntry, deleteUntouchedManualEntry } from '@/lib/supabase/happyCallQueue';
import { useHappyCallWorklist } from '@/components/happy-call/useHappyCallWorklist';
import { CallActions, DoneTodaySection, OrdinalBadge, OverdueBadge, PhoneCell, kindText } from '@/components/happy-call/CallParts';
import { diffDaysKst, todayKst } from '@/lib/kst';
import { MANUAL_CALL_TYPES, type ManualCallType, type WorklistItem } from '@/lib/happyCallQueue';

const cellStyle = { border: '1px solid #ddd', padding: 6, verticalAlign: 'top' as const };
const smallButton = {
  border: '1px solid var(--color-line)',
  background: 'var(--color-surface-2)',
  borderRadius: 8,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 600,
} as const;

export default function HappyCallListPage() {
  const { supabase, today, worklist, staffNames, loading, error, setError, busyKey, reload, record, postpone, undo } =
    useHappyCallWorklist();

  const [callType, setCallType] = useState<ManualCallType | ''>('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [callDate, setCallDate] = useState(todayKst());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(true);

  const ready = callType !== '' && name.trim() !== '' && callDate !== '';

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await createManualEntry(supabase, {
        patientName: name.trim(),
        note: note.trim(),
        callDate,
        createdBy: user?.id ?? null,
        callType: callType as ManualCallType,
        phone: phone.trim() || null,
      });
      setName('');
      setPhone('');
      setNote('');
      // 종류와 통화 예정일은 남겨 둔다 — 같은 종류를 연달아 추가하는 일이 많다.
      await reload();
    } catch {
      setError('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: WorklistItem) {
    if (!await confirmDialog(`${item.patientName}님 ${kindText(item)} 해피콜을 삭제할까요?`)) return;
    const ok = await deleteUntouchedManualEntry(supabase, item.id);
    if (!ok) {
      setError('지우지 못했어요. 비급여 현황에서 만든 콜이면 비급여 현황에서 고치거나 지워 주세요.');
      return;
    }
    await reload();
  }

  const open = worklist?.open ?? [];
  const upcoming = worklist?.upcoming ?? [];
  const doneToday = worklist?.doneToday ?? [];

  if (loading && !worklist && !error) return <p>불러오는 중...</p>;

  const deletable = (item: WorklistItem) => item.kind === 'manual' && item.attempts === 0;

  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>해피콜 목록</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {error && !worklist && (
        <button type="button" onClick={() => reload()} style={{ marginBottom: 16 }}>
          다시 불러오기
        </button>
      )}

      <form onSubmit={handleAdd} className="card" style={{ padding: 14, marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>+ 해피콜 추가</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label className="muted-text" style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>
              종류
            </label>
            <select value={callType} onChange={(e) => setCallType(e.target.value as ManualCallType | '')} className="input-field" style={{ width: 130 }}>
              <option value="">종류 선택</option>
              {MANUAL_CALL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <input placeholder="환자명" value={name} onChange={(e) => setName(e.target.value)} className="input-field" style={{ width: 120 }} />
          <input placeholder="연락처 (선택)" value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field" style={{ width: 150 }} />
          <div>
            <label className="muted-text" style={{ display: 'block', fontSize: 12, marginBottom: 3 }}>
              통화 예정일
            </label>
            <input type="date" value={callDate} onChange={(e) => setCallDate(e.target.value)} className="input-field" style={{ width: 160 }} />
          </div>
          <input placeholder="메모 (선택)" value={note} onChange={(e) => setNote(e.target.value)} className="input-field" style={{ flex: '1 1 180px', minWidth: 160 }} />
          <button
            type="submit"
            disabled={!ready || saving}
            className="btn-primary"
            style={{ padding: '10px 18px', fontSize: 14 }}
            title={ready ? undefined : '종류와 환자명을 입력해 주세요'}
          >
            {saving ? '추가 중...' : '추가'}
          </button>
        </div>
        <p className="muted-text" style={{ fontSize: 12, margin: '8px 0 0' }}>
          비급여 현황에 구매를 입력하면 해피콜이 자동으로 만들어져요. 여기서는 그 밖에 직접 걸 콜을 추가해요.
        </p>
      </form>

      {worklist && (
        <>
          <p className="muted-text" style={{ marginBottom: 8, fontSize: 13 }}>
            오늘({today}) 걸 콜 {open.length}건 · 앞으로 예정 {upcoming.length}건
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 16 }}>
              <thead>
                <tr style={{ background: '#f0f0f0' }}>
                  <th style={{ ...cellStyle, textAlign: 'left' }}>유형</th>
                  <th style={{ ...cellStyle, textAlign: 'left' }}>환자명</th>
                  <th style={{ ...cellStyle, textAlign: 'left' }}>차수</th>
                  <th style={{ ...cellStyle, textAlign: 'left' }}>전화번호</th>
                  <th style={{ ...cellStyle, textAlign: 'left' }}>진료의</th>
                  <th style={{ ...cellStyle, textAlign: 'left' }}>예정일</th>
                  <th style={{ ...cellStyle, textAlign: 'left' }}>메모</th>
                  <th style={cellStyle}></th>
                </tr>
              </thead>
              <tbody>
                {open.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 12, textAlign: 'center', color: '#666' }}>
                      오늘 해피콜 대상이 없습니다.
                    </td>
                  </tr>
                )}
                {open.map((item) => (
                  <tr key={item.key}>
                    <td style={cellStyle}>{kindText(item)}</td>
                    <td style={cellStyle}>{item.patientName}</td>
                    <td style={cellStyle}>
                      <OrdinalBadge attempts={item.attempts} />
                    </td>
                    <td style={cellStyle}>
                      <PhoneCell phone={item.phone} source={item.phoneSource} ambiguous={item.phoneAmbiguous} />
                    </td>
                    <td style={cellStyle}>{item.doctorStaffId ? (staffNames[item.doctorStaffId] ?? '-') : '-'}</td>
                    <td style={cellStyle}>
                      <span style={{ marginRight: 6, color: item.dueDate < today ? 'var(--color-error)' : undefined }}>{item.dueDate}</span>
                      <OverdueBadge dueDate={item.dueDate} today={today} />
                    </td>
                    <td style={cellStyle}>{[item.note, item.memo].filter(Boolean).join(' · ') || ''}</td>
                    <td style={cellStyle}>
                      <CallActions
                        item={item}
                        busy={busyKey === item.key}
                        onRecord={(action, memo) => record(item, action, memo)}
                        onPostpone={() => postpone(item)}
                      />
                      {deletable(item) && (
                        <button type="button" onClick={() => handleDelete(item)} style={{ ...smallButton, color: 'var(--color-error)', marginTop: 6 }}>
                          삭제
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: 24 }}>
            <button
              type="button"
              onClick={() => setShowUpcoming((v) => !v)}
              style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: 14, padding: 0, color: 'var(--color-ink)' }}
            >
              앞으로 예정된 해피콜 ({upcoming.length}건) {showUpcoming ? '▲' : '▼'}
            </button>
            {showUpcoming &&
              (upcoming.length === 0 ? (
                <p className="muted-text" style={{ fontSize: 13, margin: '8px 0 0' }}>
                  예정된 해피콜이 없어요.
                </p>
              ) : (
                <div style={{ overflowX: 'auto', marginTop: 8 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr style={{ background: '#f0f0f0' }}>
                        {['유형', '환자명', '예정일', '전화번호', '메모', ''].map((h, i) => (
                          <th key={`${h}-${i}`} style={{ ...cellStyle, textAlign: 'left' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {upcoming.map((item) => {
                        const days = diffDaysKst(today, item.dueDate);
                        return (
                          <tr key={item.key} style={{ color: '#555' }}>
                            <td style={cellStyle}>{kindText(item)}</td>
                            <td style={cellStyle}>{item.patientName}</td>
                            <td style={cellStyle}>
                              {item.dueDate} <span className="muted-text" style={{ fontSize: 12 }}>({days === 1 ? '내일' : `${days}일 뒤`})</span>
                            </td>
                            <td style={cellStyle}>
                              <PhoneCell phone={item.phone} source={item.phoneSource} ambiguous={item.phoneAmbiguous} />
                            </td>
                            <td style={cellStyle}>{[item.note, item.memo].filter(Boolean).join(' · ') || ''}</td>
                            <td style={cellStyle}>
                              {deletable(item) && (
                                <button type="button" onClick={() => handleDelete(item)} style={{ ...smallButton, color: 'var(--color-error)' }}>
                                  삭제
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>

          <div style={{ marginBottom: 32 }}>
            <DoneTodaySection items={doneToday} staffNames={staffNames} busyKey={busyKey} onUndo={undo} />
          </div>
        </>
      )}
    </div>
  );
}
