'use client';

import { confirmDialog } from '@/lib/confirmDialog';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { currentMonthKst, todayKst } from '@/lib/kst';
import { isCountCategory, parseCount, type IncentiveCategory } from '@/lib/incentive';
import { CategoryManager } from '@/components/incentive/CategoryManager';

interface Profile {
  id: string;
  staffId: string;
  staffName: string;
  note: string;
  active: boolean;
}

interface EntryWithIncentive {
  id: string;
  categoryId: string;
  entryDate: string;
  patientName: string;
  amount: number;
  note: string;
  incentiveAmount: number;
}

/** 월말 개수로 입력하는 항목(추나 등)의 그 달 개수·지급액 */
interface CountRow {
  categoryId: string;
  name: string;
  color: string;
  active: boolean;
  count: number;
  amount: number;
  /** 건당 금액 — 원장에게만 내려온다 */
  unitAmount: number | null;
}

interface StaffOption {
  id: string;
  name: string;
}

export default function IncentivePage() {
  const supabase = useMemo(() => createClient(), []);
  const [isOwner, setIsOwner] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [month, setMonth] = useState(currentMonthKst());
  const [categories, setCategories] = useState<IncentiveCategory[]>([]);
  const [entries, setEntries] = useState<EntryWithIncentive[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [countsTotal, setCountsTotal] = useState(0);
  // 개수 칸에 입력 중인 값(저장 전). 저장하면 지운다.
  const [countDraft, setCountDraft] = useState<Record<string, string>>({});
  const [savingCountId, setSavingCountId] = useState('');
  // 내역 수정
  const [editingId, setEditingId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editPatient, setEditPatient] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 새 부원장 추가(원장 전용)
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [newStaffId, setNewStaffId] = useState('');
  const [cloneFromId, setCloneFromId] = useState('');
  const [addingProfile, setAddingProfile] = useState(false);

  // 내역 추가
  const [entryDate, setEntryDate] = useState(todayKst());
  const [patientName, setPatientName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [addingEntry, setAddingEntry] = useState(false);

  const loadProfiles = useCallback(async () => {
    const res = await fetch('/api/incentive/profiles');
    if (!res.ok) throw new Error();
    const body = (await res.json()) as { isOwner: boolean; profiles: Profile[] };
    setIsOwner(body.isOwner);
    setProfiles(body.profiles);
    setSelectedId((prev) => (body.profiles.some((p) => p.id === prev) ? prev : body.profiles[0]?.id ?? ''));
    return body;
  }, []);

  const loadDetail = useCallback(async (profileId: string, forMonth: string) => {
    if (!profileId) {
      setCategories([]);
      setEntries([]);
      setTotal(0);
      setCounts([]);
      setCountsTotal(0);
      return;
    }
    const [catRes, entRes, countRes] = await Promise.all([
      fetch(`/api/incentive/categories?profileId=${profileId}`),
      fetch(`/api/incentive/entries?profileId=${profileId}&month=${forMonth}`),
      fetch(`/api/incentive/counts?profileId=${profileId}&month=${forMonth}`),
    ]);
    if (!catRes.ok || !entRes.ok) throw new Error();
    setCategories((await catRes.json()) as IncentiveCategory[]);
    const entBody = (await entRes.json()) as { entries: EntryWithIncentive[]; total: number };
    setEntries(entBody.entries);
    setTotal(entBody.total);
    // 월말 개수 표를 아직 만들지 않았어도(SQL 실행 전) 나머지 화면은 그대로 보여 준다.
    if (countRes.ok) {
      const countBody = (await countRes.json()) as { counts: CountRow[]; total: number };
      setCounts(countBody.counts);
      setCountsTotal(countBody.total);
    } else {
      setCounts([]);
      setCountsTotal(0);
    }
    setCountDraft({});
    setEditingId('');
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    loadProfiles()
      .catch(() => setError('불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [loadProfiles]);

  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId, month).catch(() => setError('불러오지 못했습니다.'));
  }, [selectedId, month, loadDetail]);

  // 원장만 "새 부원장 추가"에서 쓸 직원 목록을 읽는다(staff 표는 승인된 직원 누구나 읽을 수 있지만,
  // 이 드롭다운 자체는 원장 전용 UI라 owner일 때만 가져온다).
  useEffect(() => {
    if (!isOwner) return;
    (async () => {
      try {
        const { data } = await supabase.from('staff').select('id, name').order('name');
        setStaffOptions((data as StaffOption[]) ?? []);
      } catch {
        // 못 불러와도 "새 부원장 추가"만 못 쓸 뿐, 나머지 화면은 정상 동작한다.
      }
    })();
  }, [isOwner, supabase]);

  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? null;
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const canEditCategories = isOwner;
  // 환자별로 적는 항목 — 추나처럼 건당 고정 금액인 항목은 아래 "월말 개수"에서 개수만 입력한다.
  const entryCategories = categories.filter((c) => c.active && !isCountCategory(c));

  useEffect(() => {
    if (entryCategories.length > 0 && !entryCategories.some((c) => c.id === categoryId)) setCategoryId(entryCategories[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, categoryId]);

  async function refreshDetail() {
    if (!selectedId) return;
    await loadDetail(selectedId, month);
  }

  async function handleAddProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!newStaffId) return;
    setAddingProfile(true);
    setError('');
    try {
      const res = await fetch('/api/incentive/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: newStaffId, cloneFromProfileId: cloneFromId || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error);
      }
      setNewStaffId('');
      setCloneFromId('');
      setShowAddProfile(false);
      const body = await loadProfiles();
      const created = body.profiles.find((p) => p.staffId === newStaffId);
      if (created) setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : '추가하지 못했습니다.');
    } finally {
      setAddingProfile(false);
    }
  }

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !categoryId || !patientName.trim()) return;
    setAddingEntry(true);
    setError('');
    try {
      const res = await fetch('/api/incentive/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: selectedId,
          categoryId,
          entryDate,
          patientName: patientName.trim(),
          amount: selectedCategory?.calcType === 'percent_of_amount' ? Number(amount) || 0 : 0,
          note,
        }),
      });
      if (!res.ok) throw new Error();
      setPatientName('');
      setAmount('');
      setNote('');
      await refreshDetail();
    } catch {
      setError('추가하지 못했습니다.');
    } finally {
      setAddingEntry(false);
    }
  }

  function startEdit(e: EntryWithIncentive) {
    setEditingId(e.id);
    setEditDate(e.entryDate);
    setEditPatient(e.patientName);
    setEditCategoryId(e.categoryId);
    setEditAmount(e.amount > 0 ? String(e.amount) : '');
    setEditNote(e.note);
  }

  async function handleSaveEdit() {
    if (!editingId || !editPatient.trim() || !editDate || !editCategoryId) return;
    const category = categories.find((c) => c.id === editCategoryId);
    setSavingEdit(true);
    setError('');
    try {
      const res = await fetch(`/api/incentive/entries/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: editCategoryId,
          entryDate: editDate,
          patientName: editPatient.trim(),
          amount: category?.calcType === 'percent_of_amount' ? Number(editAmount) || 0 : 0,
          note: editNote,
        }),
      });
      if (!res.ok) throw new Error();
      await refreshDetail();
    } catch {
      setError('수정하지 못했습니다.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleSaveCount(row: CountRow) {
    const raw = countDraft[row.categoryId];
    if (raw === undefined) return;
    const next = parseCount(raw);
    if (next === null) {
      setError('개수는 0 이상의 숫자로 입력해 주세요.');
      return;
    }
    if (next === row.count) {
      setCountDraft(({ [row.categoryId]: _unused, ...rest }) => rest);
      return;
    }
    setSavingCountId(row.categoryId);
    setError('');
    try {
      const res = await fetch('/api/incentive/counts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: selectedId, categoryId: row.categoryId, month, count: next }),
      });
      if (!res.ok) throw new Error();
      await refreshDetail();
    } catch {
      setError('개수를 저장하지 못했습니다.');
    } finally {
      setSavingCountId('');
    }
  }

  async function handleDeleteEntry(id: string) {
    if (!(await confirmDialog('이 내역을 삭제할까요?'))) return;
    try {
      const res = await fetch(`/api/incentive/entries/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      await refreshDetail();
    } catch {
      setError('삭제하지 못했습니다.');
    }
  }

  if (loading) return <p className="muted-text">불러오는 중...</p>;

  if (!isOwner && profiles.length === 0) {
    return (
      <div>
        <h1 style={{ marginBottom: 6 }}>마이페이지</h1>
        <p className="muted-text">볼 수 있는 정보가 없어요.</p>
      </div>
    );
  }

  const staffWithoutProfile = staffOptions.filter((s) => !profiles.some((p) => p.staffId === s.id));

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>👤 마이페이지</h1>
      <p className="muted-text" style={{ marginBottom: 20 }}>
        {isOwner ? '부원장별 내역을 확인·관리해요.' : '내 개인 내역이에요. 나만 볼 수 있어요.'}
      </p>

      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

      {isOwner && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid var(--color-line)',
                background: p.id === selectedId ? 'var(--color-brand-b)' : 'var(--color-surface)',
                color: p.id === selectedId ? '#fff' : 'var(--color-ink)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {p.staffName}
            </button>
          ))}
          <button
            onClick={() => {
              setShowAddProfile((v) => {
                const next = !v;
                // 새로 열 때마다 "일단은 기존 부원장과 똑같이" 기본 선택해 둔다 — 원장이 매번 고르지
                // 않아도 되게(원장 요청, 2026-10-02). 물론 추가 뒤에는 자유롭게 바꿀 수 있다.
                if (next) setCloneFromId((prev) => prev || profiles[0]?.id || '');
                return next;
              });
            }}
            style={{ padding: '6px 14px', borderRadius: 999, border: '1px dashed var(--color-line)', background: 'transparent', fontSize: 13, fontWeight: 600 }}
          >
            + 새 부원장 추가
          </button>
        </div>
      )}

      {isOwner && showAddProfile && (
        <form onSubmit={handleAddProfile} className="card" style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>직원 선택</label>
            <select className="input-field" value={newStaffId} onChange={(e) => setNewStaffId(e.target.value)} style={{ width: 160 }}>
              <option value="">선택</option>
              {staffWithoutProfile.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {profiles.length > 0 && (
            <div>
              <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                일단 어떤 항목으로 시작할까요?
              </label>
              <select className="input-field" value={cloneFromId} onChange={(e) => setCloneFromId(e.target.value)} style={{ width: 180 }}>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.staffName}
                  </option>
                ))}
                <option value="">빈 상태로 시작</option>
              </select>
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={addingProfile || !newStaffId} style={{ padding: '7px 16px' }}>
            {addingProfile ? '추가 중...' : '추가'}
          </button>
          <p className="muted-text" style={{ width: '100%', fontSize: 12, margin: 0 }}>
            일단 똑같이 시작해도, 추가한 뒤에 이 부원장만 따로 항목·비율을 자유롭게 바꿀 수 있어요.
          </p>
        </form>
      )}

      {selectedProfile && (
        <>
          {/* 항목·비율 설정은 원장만 보고 고친다 — 부원장은 비율을 보거나 고칠 수 없다(원장 요청, 2026-10-02).
              부원장도 실적을 적을 땐 구분 이름은 알아야 하니, 그건 아래 "내역 추가" 드롭다운에서 보여준다. */}
          {isOwner && (
            <CategoryManager profileId={selectedProfile.id} categories={categories} editable={canEditCategories} onChanged={refreshDetail} />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <label className="muted-text" style={{ fontSize: 13 }}>
              기준 달
            </label>
            <input className="input-field" type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 150 }} />
          </div>

          <form onSubmit={handleAddEntry} className="card" style={{ padding: 16, marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>날짜</label>
              <input className="input-field" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div>
              <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>환자명</label>
              <input className="input-field" value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="예: 홍길동" style={{ width: 120 }} />
            </div>
            <div>
              <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>구분</label>
              <select className="input-field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ width: 150 }}>
                {entryCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedCategory?.calcType === 'percent_of_amount' && (
              <div>
                <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>결제금액</label>
                <input className="input-field" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 120 }} />
              </div>
            )}
            <div>
              <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>메모</label>
              <input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: 140 }} />
            </div>
            <button type="submit" className="btn-primary" disabled={addingEntry || entryCategories.length === 0} style={{ padding: '7px 16px' }}>
              {addingEntry ? '추가 중...' : '추가'}
            </button>
          </form>

          {counts.length > 0 && (
            <div className="card" style={{ padding: 16, marginBottom: 20 }}>
              <p style={{ fontWeight: 700, marginBottom: 2 }}>🔢 월말 개수 입력 ({month})</p>
              <p className="muted-text" style={{ fontSize: 12, marginBottom: 10 }}>
                추나는 환자별로 적지 않아도 돼요. 한 달 동안 한 개수만 입력하면 지급액이 자동으로 계산돼요. 숫자를 바꾸고 칸 밖을 누르면 저장돼요.
              </p>
              {counts.map((row) => (
                <div key={row.categoryId} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0', borderTop: '1px solid var(--color-line)' }}>
                  <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 13, fontWeight: 700, color: '#fff', background: row.color, minWidth: 80, textAlign: 'center' }}>{row.name}</span>
                  <input
                    className="input-field"
                    type="number"
                    min={0}
                    aria-label={`${row.name} 개수`}
                    value={countDraft[row.categoryId] ?? String(row.count)}
                    onChange={(e) => setCountDraft((d) => ({ ...d, [row.categoryId]: e.target.value }))}
                    onBlur={() => handleSaveCount(row)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    disabled={savingCountId === row.categoryId}
                    style={{ width: 90 }}
                  />
                  <span>개</span>
                  {row.unitAmount != null && <span className="muted-text" style={{ fontSize: 12 }}>× {row.unitAmount.toLocaleString('ko-KR')}원</span>}
                  <span style={{ fontWeight: 700 }}>= {row.amount.toLocaleString('ko-KR')}원</span>
                  {savingCountId === row.categoryId && <span className="muted-text" style={{ fontSize: 12 }}>저장 중...</span>}
                </div>
              ))}
            </div>
          )}

          <p style={{ fontWeight: 700, marginBottom: 10 }}>
            {month} 합계: {(total + countsTotal).toLocaleString('ko-KR')}원
            {countsTotal > 0 && (
              <span className="muted-text" style={{ fontWeight: 400, fontSize: 13 }}>
                {' '}(내역 {total.toLocaleString('ko-KR')}원 + 월말 개수 {countsTotal.toLocaleString('ko-KR')}원)
              </span>
            )}
          </p>

          {entries.length === 0 ? (
            <p className="muted-text">이 달 입력된 내역이 없어요.</p>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--color-muted)', fontSize: 12 }}>
                    {['날짜', '환자명', '구분', '결제금액', '지급액', '메모', ''].map((h) => (
                      <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const category = categories.find((c) => c.id === e.categoryId);
                    if (editingId === e.id) {
                      // 수정 중인 줄 — 구분은 환자별로 적는 항목 + 원래 구분. 결제금액은 비율 항목일 때만.
                      const options = categories.filter((c) => (c.active && !isCountCategory(c)) || c.id === e.categoryId);
                      const editCategory = categories.find((c) => c.id === editCategoryId);
                      const cellStyle = { padding: '6px 6px', borderBottom: '1px solid var(--color-line)' } as const;
                      return (
                        <tr key={e.id} style={{ background: 'var(--color-bg, #f6f7f4)' }}>
                          <td style={cellStyle}><input className="input-field" type="date" value={editDate} onChange={(ev) => setEditDate(ev.target.value)} style={{ width: 140 }} /></td>
                          <td style={cellStyle}><input className="input-field" value={editPatient} onChange={(ev) => setEditPatient(ev.target.value)} style={{ width: 110 }} /></td>
                          <td style={cellStyle}>
                            <select className="input-field" value={editCategoryId} onChange={(ev) => setEditCategoryId(ev.target.value)} style={{ width: 140 }}>
                              {options.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </td>
                          <td style={cellStyle}>
                            {editCategory?.calcType === 'percent_of_amount' ? (
                              <input className="input-field" type="number" min={0} value={editAmount} onChange={(ev) => setEditAmount(ev.target.value)} style={{ width: 110 }} />
                            ) : (
                              '-'
                            )}
                          </td>
                          <td style={cellStyle} className="muted-text">저장하면 다시 계산돼요</td>
                          <td style={cellStyle}><input className="input-field" value={editNote} onChange={(ev) => setEditNote(ev.target.value)} style={{ width: 130 }} /></td>
                          <td style={{ ...cellStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button type="button" className="btn-primary" onClick={handleSaveEdit} disabled={savingEdit || !editPatient.trim()} style={{ padding: '4px 12px', fontSize: 12 }}>
                              {savingEdit ? '저장 중...' : '저장'}
                            </button>{' '}
                            <button type="button" onClick={() => setEditingId('')} disabled={savingEdit} style={{ border: 'none', background: 'transparent', color: 'var(--color-muted)', fontSize: 12, fontWeight: 600 }}>
                              취소
                            </button>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={e.id}>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)', whiteSpace: 'nowrap' }}>{e.entryDate}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)', fontWeight: 600 }}>{e.patientName}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: '#fff', background: category?.color ?? '#888' }}>
                            {category?.name ?? '(삭제된 항목)'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)' }}>{e.amount > 0 ? `${e.amount.toLocaleString('ko-KR')}원` : '-'}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)', fontWeight: 700 }}>{e.incentiveAmount.toLocaleString('ko-KR')}원</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)', color: 'var(--color-muted)' }}>{e.note || '-'}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            onClick={() => startEdit(e)}
                            style={{ border: 'none', background: 'transparent', color: 'var(--color-brand-b)', fontSize: 12, fontWeight: 600, padding: 0, marginRight: 10 }}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(e.id)}
                            style={{ border: 'none', background: 'transparent', color: 'var(--color-error)', fontSize: 12, fontWeight: 600, padding: 0 }}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
