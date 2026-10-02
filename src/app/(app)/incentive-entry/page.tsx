'use client';

import { confirmDialog } from '@/lib/confirmDialog';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { todayKst } from '@/lib/kst';

interface CategoryOption {
  id: string;
  name: string;
  color: string;
  needsAmount: boolean;
}

interface EntryOption {
  profileId: string;
  doctorName: string;
  categories: CategoryOption[];
}

interface RecentEntry {
  id: string;
  profileId: string;
  doctorName: string;
  entryDate: string;
  patientName: string;
  categoryName: string;
  amount: number;
  note: string;
}

// 원장님 인센티브 계산용 실적을 기록하는 화면 — 결제를 처리하는 직원·팀장이 쓴다.
// 인센티브 금액·비율은 이 화면 어디에도 없다(원장·해당 부원장만 "인센티브" 화면에서 봄).
export default function IncentiveEntryPage() {
  const [options, setOptions] = useState<EntryOption[]>([]);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [profileId, setProfileId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [entryDate, setEntryDate] = useState(todayKst());
  const [patientName, setPatientName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/incentive/entry-options');
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { options: EntryOption[]; recent: RecentEntry[] };
      setOptions(body.options);
      setRecent(body.recent);
      setProfileId((prev) => prev || body.options[0]?.profileId || '');
    } catch {
      setError('불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedDoctor = useMemo(() => options.find((o) => o.profileId === profileId), [options, profileId]);
  const categories = selectedDoctor?.categories ?? [];
  const selectedCategory = categories.find((c) => c.id === categoryId);

  useEffect(() => {
    if (categories.length > 0 && !categories.some((c) => c.id === categoryId)) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profileId || !categoryId || !patientName.trim()) {
      setError('원장·구분·환자명을 채워주세요.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/incentive/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          categoryId,
          entryDate,
          patientName: patientName.trim(),
          amount: selectedCategory?.needsAmount ? Number(amount) || 0 : 0,
          note,
        }),
      });
      if (!res.ok) throw new Error();
      setPatientName('');
      setAmount('');
      setNote('');
      await load();
    } catch {
      setError('추가하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirmDialog('이 실적 기록을 삭제할까요?'))) return;
    try {
      const res = await fetch(`/api/incentive/entries/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError('삭제하지 못했습니다.');
    }
  }

  if (loading) return <p className="muted-text">불러오는 중...</p>;

  if (options.length === 0) {
    return (
      <div>
        <h1 style={{ marginBottom: 6 }}>진료 실적 입력</h1>
        <p className="muted-text">아직 인센티브 계산이 설정된 원장님이 없어요.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>진료 실적 입력</h1>
      <p className="muted-text" style={{ marginBottom: 20 }}>
        원장님 인센티브 계산용 기록이에요. 날짜·환자명·구분·금액만 적으면 돼요.
      </p>

      <form onSubmit={handleSubmit} className="card" style={{ padding: 18, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div>
            <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
              원장
            </label>
            <select className="input-field" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {options.map((o) => (
                <option key={o.profileId} value={o.profileId}>
                  {o.doctorName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
              날짜
            </label>
            <input className="input-field" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </div>
          <div>
            <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
              환자명
            </label>
            <input className="input-field" value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="예: 홍길동" />
          </div>
          <div>
            <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
              구분
            </label>
            <select className="input-field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {selectedCategory?.needsAmount && (
            <div>
              <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
                결제금액
              </label>
              <input className="input-field" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="990000" />
            </div>
          )}
          <div>
            <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
              메모(선택)
            </label>
            <input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 녹용관절고" />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14 }}>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? '추가 중...' : '추가하기'}
          </button>
          {error && <span className="error-text">{error}</span>}
        </div>
      </form>

      <h2 style={{ fontSize: 15, marginBottom: 10 }}>최근 입력 내역</h2>
      {recent.length === 0 ? (
        <p className="muted-text">아직 입력된 기록이 없어요.</p>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--color-muted)', fontSize: 12 }}>
                {['날짜', '원장', '환자명', '구분', '결제금액', '메모', ''].map((h) => (
                  <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)', whiteSpace: 'nowrap' }}>{r.entryDate}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)', whiteSpace: 'nowrap' }}>{r.doctorName}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)', fontWeight: 600 }}>{r.patientName}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)' }}>{r.categoryName}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)' }}>{r.amount > 0 ? `${r.amount.toLocaleString('ko-KR')}원` : '-'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)', color: 'var(--color-muted)' }}>{r.note || '-'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-line)', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      style={{ border: 'none', background: 'transparent', color: 'var(--color-error)', fontSize: 12, fontWeight: 600, padding: 0 }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
