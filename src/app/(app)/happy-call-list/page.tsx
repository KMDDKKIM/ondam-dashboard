'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  createHerbPrescription,
  listPendingHerbCalls,
  markHerbCallDone,
  createDietPackage,
  addDietPackageCall,
  listDietPackages,
  listPendingDietCalls,
  markDietCallDone,
  createManualEntry,
  listPendingManualEntries,
  markManualEntryDone,
  type PendingDietCall,
} from '@/lib/supabase/happyCallQueue';
import { listHappyCallPatients, updateHappyCallPatient } from '@/lib/supabase/happyCallPatients';
import { listPendingFirstVisitCalls } from '@/lib/happyCallStats';
import type { HerbMedicinePrescription, HappyCallManualEntry, DietPackage } from '@/lib/types';

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type WorklistRow =
  | { kind: 'herb'; id: string; patientName: string; callDate: string; callNumber: 1 | 2 | 3; prescriptionId: string }
  | { kind: 'diet'; id: string; patientName: string; callDate: string }
  | { kind: 'manual'; id: string; patientName: string; callDate: string; note: string | null }
  | { kind: 'firstVisit'; id: string; patientName: string; callDate: string };

const cellStyle = { border: '1px solid #ddd', padding: 6 };
const formBoxStyle = { border: '1px solid #ddd', borderRadius: 8, padding: 12 };
const formInputStyle = { display: 'block' as const, marginBottom: 6, padding: 6 };

export default function HappyCallListPage() {
  const [herbPrescriptions, setHerbPrescriptions] = useState<HerbMedicinePrescription[]>([]);
  const [dietCalls, setDietCalls] = useState<PendingDietCall[]>([]);
  const [dietPackages, setDietPackages] = useState<DietPackage[]>([]);
  const [manualEntries, setManualEntries] = useState<HappyCallManualEntry[]>([]);
  const [firstVisitCalls, setFirstVisitCalls] = useState<{ id: string; patientName: string; callDate: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [herbName, setHerbName] = useState('');
  const [herbPickupDate, setHerbPickupDate] = useState('');
  const [herbDuration, setHerbDuration] = useState('');

  const [dietName, setDietName] = useState('');
  const [dietStartDate, setDietStartDate] = useState('');

  const [extraCallPackageId, setExtraCallPackageId] = useState('');
  const [extraCallDate, setExtraCallDate] = useState('');

  const [manualName, setManualName] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [manualCallDate, setManualCallDate] = useState(todayISO());

  const supabase = createClient();
  const today = todayISO();

  async function load() {
    setLoading(true);
    try {
      const [herb, diet, packages, manual, firstVisitPatients] = await Promise.all([
        listPendingHerbCalls(supabase, today),
        listPendingDietCalls(supabase, today),
        listDietPackages(supabase),
        listPendingManualEntries(supabase, today),
        listHappyCallPatients(supabase),
      ]);
      setHerbPrescriptions(herb);
      setDietCalls(diet);
      setDietPackages(packages);
      setManualEntries(manual);
      setFirstVisitCalls(listPendingFirstVisitCalls(firstVisitPatients, today));
    } catch {
      setError('불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function currentUserId(): Promise<string | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  }

  async function handleAddHerb(event: React.FormEvent) {
    event.preventDefault();
    if (!herbName || !herbPickupDate || !herbDuration) return;
    try {
      await createHerbPrescription(supabase, {
        patientName: herbName,
        pickupDate: herbPickupDate,
        durationDays: Number(herbDuration),
        createdBy: await currentUserId(),
      });
      setHerbName('');
      setHerbPickupDate('');
      setHerbDuration('');
      await load();
    } catch {
      setError('저장에 실패했습니다.');
    }
  }

  async function handleAddDiet(event: React.FormEvent) {
    event.preventDefault();
    if (!dietName || !dietStartDate) return;
    try {
      await createDietPackage(supabase, {
        patientName: dietName,
        detoxStartDate: dietStartDate,
        createdBy: await currentUserId(),
      });
      setDietName('');
      setDietStartDate('');
      await load();
    } catch {
      setError('저장에 실패했습니다.');
    }
  }

  async function handleAddExtraDietCall(event: React.FormEvent) {
    event.preventDefault();
    if (!extraCallPackageId || !extraCallDate) return;
    try {
      await addDietPackageCall(supabase, extraCallPackageId, extraCallDate);
      setExtraCallPackageId('');
      setExtraCallDate('');
      await load();
    } catch {
      setError('저장에 실패했습니다.');
    }
  }

  async function handleAddManual(event: React.FormEvent) {
    event.preventDefault();
    if (!manualName || !manualCallDate) return;
    try {
      await createManualEntry(supabase, {
        patientName: manualName,
        note: manualNote,
        callDate: manualCallDate,
        createdBy: await currentUserId(),
      });
      setManualName('');
      setManualNote('');
      setManualCallDate(todayISO());
      await load();
    } catch {
      setError('저장에 실패했습니다.');
    }
  }

  const rows: WorklistRow[] = [
    ...herbPrescriptions.flatMap((p) => {
      const items: WorklistRow[] = [];
      if (!p.call1Done && p.callDate1 <= today)
        items.push({ kind: 'herb', id: `${p.id}-1`, patientName: p.patientName, callDate: p.callDate1, callNumber: 1, prescriptionId: p.id });
      if (!p.call2Done && p.callDate2 <= today)
        items.push({ kind: 'herb', id: `${p.id}-2`, patientName: p.patientName, callDate: p.callDate2, callNumber: 2, prescriptionId: p.id });
      if (!p.call3Done && p.callDate3 <= today)
        items.push({ kind: 'herb', id: `${p.id}-3`, patientName: p.patientName, callDate: p.callDate3, callNumber: 3, prescriptionId: p.id });
      return items;
    }),
    ...dietCalls.map((c) => ({ kind: 'diet' as const, id: c.id, patientName: c.patientName, callDate: c.callDate })),
    ...manualEntries.map((m) => ({ kind: 'manual' as const, id: m.id, patientName: m.patientName, callDate: m.callDate, note: m.note })),
    ...firstVisitCalls.map((c) => ({ kind: 'firstVisit' as const, id: c.id, patientName: c.patientName, callDate: c.callDate })),
  ].sort((a, b) => a.callDate.localeCompare(b.callDate));

  async function handleComplete(row: WorklistRow) {
    const note = window.prompt('통화 메모 (선택)');
    if (note === null) return;
    try {
      if (row.kind === 'herb') {
        await markHerbCallDone(supabase, row.prescriptionId, row.callNumber, note);
      } else if (row.kind === 'diet') {
        await markDietCallDone(supabase, row.id, note);
      } else if (row.kind === 'manual') {
        await markManualEntryDone(supabase, row.id, note);
      } else {
        await updateHappyCallPatient(supabase, row.id, { callLog: note || '통화 완료' });
      }
      await load();
    } catch {
      setError('처리에 실패했습니다.');
    }
  }

  const kindLabel: Record<WorklistRow['kind'], string> = { herb: '한약', diet: '린다이어트', manual: '초진(수동)', firstVisit: '초진환자' };

  if (loading) return <p>불러오는 중...</p>;

  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>해피콜 목록</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 32 }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={{ ...cellStyle, textAlign: 'left' }}>유형</th>
            <th style={{ ...cellStyle, textAlign: 'left' }}>환자명</th>
            <th style={{ ...cellStyle, textAlign: 'left' }}>예정일</th>
            <th style={{ ...cellStyle, textAlign: 'left' }}>메모</th>
            <th style={cellStyle}></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: 12, textAlign: 'center', color: '#666' }}>
                오늘 해피콜 대상이 없습니다.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>{kindLabel[row.kind]}</td>
              <td style={cellStyle}>{row.patientName}</td>
              <td style={{ ...cellStyle, color: row.callDate < today ? 'red' : undefined }}>{row.callDate}</td>
              <td style={cellStyle}>{row.kind === 'manual' ? row.note : ''}</td>
              <td style={cellStyle}>
                <button onClick={() => handleComplete(row)}>완료</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <form onSubmit={handleAddHerb} style={formBoxStyle}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>한약 처방 등록</h3>
          <input placeholder="환자명" value={herbName} onChange={(e) => setHerbName(e.target.value)} style={formInputStyle} />
          <label style={{ fontSize: 12 }}>수령일</label>
          <input type="date" value={herbPickupDate} onChange={(e) => setHerbPickupDate(e.target.value)} style={formInputStyle} />
          <label style={{ fontSize: 12 }}>기간(일수)</label>
          <input type="number" value={herbDuration} onChange={(e) => setHerbDuration(e.target.value)} style={formInputStyle} />
          <button type="submit">등록</button>
        </form>

        <form onSubmit={handleAddDiet} style={formBoxStyle}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>린다이어트 패키지 등록</h3>
          <input placeholder="환자명" value={dietName} onChange={(e) => setDietName(e.target.value)} style={formInputStyle} />
          <label style={{ fontSize: 12 }}>디톡스 시작일</label>
          <input type="date" value={dietStartDate} onChange={(e) => setDietStartDate(e.target.value)} style={formInputStyle} />
          <button type="submit">등록</button>
        </form>

        <form onSubmit={handleAddExtraDietCall} style={formBoxStyle}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>린다이어트 콜 추가 (8일째 이후)</h3>
          <select value={extraCallPackageId} onChange={(e) => setExtraCallPackageId(e.target.value)} style={formInputStyle}>
            <option value="">환자 선택</option>
            {dietPackages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.patientName} ({pkg.detoxStartDate} 시작)
              </option>
            ))}
          </select>
          <label style={{ fontSize: 12 }}>콜 날짜</label>
          <input type="date" value={extraCallDate} onChange={(e) => setExtraCallDate(e.target.value)} style={formInputStyle} />
          <button type="submit">추가</button>
        </form>

        <form onSubmit={handleAddManual} style={formBoxStyle}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>초진 해피콜 추가</h3>
          <input placeholder="환자명" value={manualName} onChange={(e) => setManualName(e.target.value)} style={formInputStyle} />
          <input placeholder="메모" value={manualNote} onChange={(e) => setManualNote(e.target.value)} style={formInputStyle} />
          <label style={{ fontSize: 12 }}>통화 예정일</label>
          <input type="date" value={manualCallDate} onChange={(e) => setManualCallDate(e.target.value)} style={formInputStyle} />
          <button type="submit">추가</button>
        </form>
      </div>
    </div>
  );
}
