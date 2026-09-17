'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  listHappyCallPatients,
  createHappyCallPatient,
  updateHappyCallPatient,
} from '@/lib/supabase/happyCallPatients';
import type { HappyCallPatient, Staff } from '@/lib/types';
import { HappyCallStatsPanel } from '@/components/happy-call/HappyCallStatsPanel';

const PATIENT_TYPES: HappyCallPatient['patientType'][] = ['건보', '자보', '비급여'];

const cellStyle = { border: '1px solid #ddd', padding: 6 };

export default function HappyCallRegisterPage() {
  const [patients, setPatients] = useState<HappyCallPatient[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newName, setNewName] = useState('');
  const [newDoctorId, setNewDoctorId] = useState('');
  const [newPatientType, setNewPatientType] = useState<HappyCallPatient['patientType']>('건보');
  const [newFirstVisitDate, setNewFirstVisitDate] = useState('');

  const supabase = createClient();

  async function load() {
    setLoading(true);
    try {
      const [patientRows, staffResult] = await Promise.all([
        listHappyCallPatients(supabase),
        supabase.from('staff').select('id, name, role'),
      ]);
      setPatients(patientRows);
      setStaffList((staffResult.data ?? []) as Staff[]);
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

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!newName || !newFirstVisitDate) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await createHappyCallPatient(supabase, {
      patientName: newName,
      doctorStaffId: newDoctorId || null,
      patientType: newPatientType,
      firstVisitDate: newFirstVisitDate,
      createdBy: user?.id ?? null,
    });
    setNewName('');
    setNewDoctorId('');
    setNewFirstVisitDate('');
    await load();
  }

  type TextField = 'revisit1' | 'revisit2' | 'revisit3' | 'jaboHerb1' | 'jaboHerb2' | 'jaboHerb3' | 'nextVisitNote' | 'callLog' | 'memo';

  async function handleFieldUpdate(id: string, field: TextField, value: string) {
    await updateHappyCallPatient(supabase, id, { [field]: value || null });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value || null } : p)));
  }

  async function handleSuccessUpdate(id: string, value: '성공' | '실패' | '') {
    const acupunctureSuccess = value === '' ? null : value;
    await updateHappyCallPatient(supabase, id, { acupunctureSuccess });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, acupunctureSuccess } : p)));
  }

  function staffName(staffId: string | null): string {
    if (!staffId) return '-';
    return staffList.find((s) => s.id === staffId)?.name ?? '-';
  }

  if (loading) return <p>불러오는 중...</p>;

  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>초진환자 해피콜</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <input placeholder="성함" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ padding: 6 }} />
        <select value={newDoctorId} onChange={(e) => setNewDoctorId(e.target.value)} style={{ padding: 6 }}>
          <option value="">진료의 선택</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={newPatientType}
          onChange={(e) => setNewPatientType(e.target.value as HappyCallPatient['patientType'])}
          style={{ padding: 6 }}
        >
          {PATIENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input type="date" value={newFirstVisitDate} onChange={(e) => setNewFirstVisitDate(e.target.value)} style={{ padding: 6 }} />
        <button type="submit" style={{ padding: '6px 16px' }}>
          추가
        </button>
      </form>

      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            {['성함', '진료의', '구분', '초진일', '재내원1', '재내원2', '재내원3', '자보약1', '자보약2', '자보약3', '약침성공', '다음내원메모', '통화내역', '메모'].map((h) => (
              <th key={h} style={{ ...cellStyle, textAlign: 'left' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <tr key={p.id}>
              <td style={cellStyle}>{p.patientName}</td>
              <td style={cellStyle}>{staffName(p.doctorStaffId)}</td>
              <td style={cellStyle}>{p.patientType}</td>
              <td style={cellStyle}>{p.firstVisitDate}</td>
              {(['revisit1', 'revisit2', 'revisit3'] as const).map((field) => (
                <td key={field} style={cellStyle}>
                  <input type="date" defaultValue={p[field] ?? ''} onBlur={(e) => handleFieldUpdate(p.id, field, e.target.value)} style={{ width: 130 }} />
                </td>
              ))}
              {(['jaboHerb1', 'jaboHerb2', 'jaboHerb3'] as const).map((field) => (
                <td key={field} style={cellStyle}>
                  <input type="date" defaultValue={p[field] ?? ''} onBlur={(e) => handleFieldUpdate(p.id, field, e.target.value)} style={{ width: 130 }} />
                </td>
              ))}
              <td style={cellStyle}>
                <select defaultValue={p.acupunctureSuccess ?? ''} onChange={(e) => handleSuccessUpdate(p.id, e.target.value as '성공' | '실패' | '')}>
                  <option value=""></option>
                  <option value="성공">성공</option>
                  <option value="실패">실패</option>
                </select>
              </td>
              <td style={cellStyle}>
                <input defaultValue={p.nextVisitNote ?? ''} onBlur={(e) => handleFieldUpdate(p.id, 'nextVisitNote', e.target.value)} style={{ width: 160 }} />
              </td>
              <td style={cellStyle}>
                <input defaultValue={p.callLog ?? ''} onBlur={(e) => handleFieldUpdate(p.id, 'callLog', e.target.value)} style={{ width: 160 }} />
              </td>
              <td style={cellStyle}>
                <input defaultValue={p.memo ?? ''} onBlur={(e) => handleFieldUpdate(p.id, 'memo', e.target.value)} style={{ width: 120 }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <HappyCallStatsPanel patients={patients} staffList={staffList} />
    </div>
  );
}
