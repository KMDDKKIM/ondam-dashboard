'use client';

import { confirmDialog } from '@/lib/confirmDialog';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { currentMonthKst, todayKst } from '@/lib/kst';
import type { IncentiveCategory } from '@/lib/incentive';
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
      return;
    }
    const [catRes, entRes] = await Promise.all([
      fetch(`/api/incentive/categories?profileId=${profileId}`),
      fetch(`/api/incentive/entries?profileId=${profileId}&month=${forMonth}`),
    ]);
    if (!catRes.ok || !entRes.ok) throw new Error();
    setCategories((await catRes.json()) as IncentiveCategory[]);
    const entBody = (await entRes.json()) as { entries: EntryWithIncentive[]; total: number };
    setEntries(entBody.entries);
    setTotal(entBody.total);
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

  useEffect(() => {
    const active = categories.filter((c) => c.active);
    if (active.length > 0 && !active.some((c) => c.id === categoryId)) setCategoryId(active[0].id);
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
        <h1 style={{ marginBottom: 6 }}>인센티브</h1>
        <p className="muted-text">볼 수 있는 인센티브 정보가 없어요.</p>
      </div>
    );
  }

  const staffWithoutProfile = staffOptions.filter((s) => !profiles.some((p) => p.staffId === s.id));

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>💵 인센티브</h1>
      <p className="muted-text" style={{ marginBottom: 20 }}>
        {isOwner ? '부원장별 인센티브를 확인·관리해요.' : '내 인센티브 내역이에요. 나만 볼 수 있어요.'}
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
            onClick={() => setShowAddProfile((v) => !v)}
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
              <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>항목 복사(선택)</label>
              <select className="input-field" value={cloneFromId} onChange={(e) => setCloneFromId(e.target.value)} style={{ width: 160 }}>
                <option value="">빈 상태로 시작</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.staffName}의 항목 복사
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={addingProfile || !newStaffId} style={{ padding: '7px 16px' }}>
            {addingProfile ? '추가 중...' : '추가'}
          </button>
        </form>
      )}

      {selectedProfile && (
        <>
          <CategoryManager profileId={selectedProfile.id} categories={categories} editable={canEditCategories} onChanged={refreshDetail} />

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
                {categories.filter((c) => c.active).map((c) => (
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
            <button type="submit" className="btn-primary" disabled={addingEntry || categories.length === 0} style={{ padding: '7px 16px' }}>
              {addingEntry ? '추가 중...' : '추가'}
            </button>
          </form>

          <p style={{ fontWeight: 700, marginBottom: 10 }}>{month} 인센티브 합계: {total.toLocaleString('ko-KR')}원</p>

          {entries.length === 0 ? (
            <p className="muted-text">이 달 입력된 내역이 없어요.</p>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--color-muted)', fontSize: 12 }}>
                    {['날짜', '환자명', '구분', '결제금액', '인센티브', '메모', ''].map((h) => (
                      <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const category = categories.find((c) => c.id === e.categoryId);
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
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)', textAlign: 'right' }}>
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
