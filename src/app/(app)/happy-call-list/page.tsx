'use client';

import { useEffect, useState } from 'react';
import {
  createHerbPrescription,
  createDietPackage,
  addDietPackageCall,
  listDietPackages,
  createManualEntry,
} from '@/lib/supabase/happyCallQueue';
import { useHappyCallWorklist } from '@/components/happy-call/useHappyCallWorklist';
import { CallActions, DoneTodaySection, OrdinalBadge, OverdueBadge, PhoneCell, kindText } from '@/components/happy-call/CallParts';
import { todayKst } from '@/lib/kst';
import type { DietPackage } from '@/lib/types';

const cellStyle = { border: '1px solid #ddd', padding: 6, verticalAlign: 'top' as const };
const formBoxStyle = { border: '1px solid #ddd', borderRadius: 8, padding: 12 };
const formInputStyle = { display: 'block' as const, marginBottom: 6, padding: 6 };

export default function HappyCallListPage() {
  const { supabase, today, worklist, staffNames, loading, error, setError, busyKey, reload, record, postpone, undo } =
    useHappyCallWorklist();
  const [dietPackages, setDietPackages] = useState<DietPackage[]>([]);

  const [herbName, setHerbName] = useState('');
  const [herbPickupDate, setHerbPickupDate] = useState('');
  const [herbDuration, setHerbDuration] = useState('');

  const [dietName, setDietName] = useState('');
  const [dietStartDate, setDietStartDate] = useState('');

  const [extraCallPackageId, setExtraCallPackageId] = useState('');
  const [extraCallDate, setExtraCallDate] = useState('');

  const [manualName, setManualName] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [manualCallDate, setManualCallDate] = useState(todayKst());

  async function loadPackages() {
    try {
      setDietPackages(await listDietPackages(supabase));
    } catch {
      setError('린다이어트 패키지 목록을 불러오지 못했어요.');
    }
  }

  useEffect(() => {
    loadPackages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 등록 폼들이 저장한 뒤 목록과 패키지 선택 목록을 함께 새로 읽는다.
  async function load() {
    await Promise.all([reload(), loadPackages()]);
  }

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
      setManualCallDate(todayKst());
      await load();
    } catch {
      setError('저장에 실패했습니다.');
    }
  }

  const open = worklist?.open ?? [];
  const doneToday = worklist?.doneToday ?? [];

  if (loading && !worklist && !error) return <p>불러오는 중...</p>;

  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>해피콜 목록</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {error && !worklist && (
        <button type="button" onClick={() => reload()} style={{ marginBottom: 16 }}>
          다시 불러오기
        </button>
      )}

      {worklist && (
        <>
          <p className="muted-text" style={{ marginBottom: 8, fontSize: 13 }}>
            오늘({today}) 걸 콜 {open.length}건
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
                      <PhoneCell phone={item.phone} />
                    </td>
                    <td style={cellStyle}>{item.doctorStaffId ? (staffNames[item.doctorStaffId] ?? '-') : '-'}</td>
                    <td style={cellStyle}>
                      <span style={{ marginRight: 6, color: item.dueDate < today ? 'var(--color-error)' : undefined }}>{item.dueDate}</span>
                      <OverdueBadge dueDate={item.dueDate} today={today} />
                    </td>
                    <td style={cellStyle}>
                      {[item.note, item.memo].filter(Boolean).join(' · ') || ''}
                    </td>
                    <td style={cellStyle}>
                      <CallActions
                        item={item}
                        busy={busyKey === item.key}
                        onRecord={(action, memo) => record(item, action, memo)}
                        onPostpone={() => postpone(item)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: 32 }}>
            <DoneTodaySection items={doneToday} staffNames={staffNames} busyKey={busyKey} onUndo={undo} />
          </div>
        </>
      )}

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
