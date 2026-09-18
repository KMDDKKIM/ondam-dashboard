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
const PACKAGE_OPTIONS = ['성공', '실패', '비포함'] as const;

const cellStyle = { border: '1px solid #ddd', padding: 4, fontSize: 13 };
const selectStyle = { fontSize: 13, padding: 2, width: '100%' };
const textInputStyle = { fontSize: 13, padding: 3, width: '100%', border: 'none', background: 'transparent' };

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function emptyDraft() {
  return {
    patientName: '',
    doctorStaffId: '',
    patientType: '건보' as HappyCallPatient['patientType'],
    firstVisitDate: todayISO(),
  };
}

export default function HappyCallRegisterPage() {
  const [patients, setPatients] = useState<HappyCallPatient[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);

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

  // 맨 아래 빈 줄에 이름과 초진일만 채워지면 바로 환자로 저장하고, 다음 사람을
  // 바로 입력할 수 있도록 또 빈 줄을 남긴다 — 구글시트처럼 언제든 이어서 입력.
  async function commitDraftIfReady(next = draft) {
    if (!next.patientName.trim() || !next.firstVisitDate || saving) return;
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await createHappyCallPatient(supabase, {
        patientName: next.patientName.trim(),
        doctorStaffId: next.doctorStaffId || null,
        patientType: next.patientType,
        firstVisitDate: next.firstVisitDate,
        createdBy: user?.id ?? null,
      });
      setDraft(emptyDraft());
      await load();
    } catch {
      setError('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  type TextField = 'revisit1' | 'revisit2' | 'revisit3' | 'jaboHerb1' | 'jaboHerb2' | 'jaboHerb3' | 'nextVisitNote' | 'callLog' | 'memo';

  async function handleFieldUpdate(id: string, field: TextField, value: string) {
    await updateHappyCallPatient(supabase, id, { [field]: value || null });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value || null } : p)));
  }

  async function handleNameUpdate(id: string, value: string) {
    if (!value.trim()) return;
    await updateHappyCallPatient(supabase, id, { patientName: value.trim() });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, patientName: value.trim() } : p)));
  }

  async function handleDateUpdate(id: string, value: string) {
    if (!value) return;
    await updateHappyCallPatient(supabase, id, { firstVisitDate: value });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, firstVisitDate: value } : p)));
  }

  async function handleDoctorUpdate(id: string, value: string) {
    const doctorStaffId = value || null;
    await updateHappyCallPatient(supabase, id, { doctorStaffId });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, doctorStaffId } : p)));
  }

  async function handleTypeUpdate(id: string, value: HappyCallPatient['patientType']) {
    await updateHappyCallPatient(supabase, id, { patientType: value });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, patientType: value } : p)));
  }

  async function handleSuccessUpdate(id: string, value: '성공' | '실패' | '비포함' | '') {
    const acupunctureSuccess = value === '' ? null : value;
    await updateHappyCallPatient(supabase, id, { acupunctureSuccess });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, acupunctureSuccess } : p)));
  }

  if (loading) return <p>불러오는 중...</p>;

  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>초진환자 해피콜</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <HappyCallStatsPanel patients={patients} staffList={staffList} />

      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, marginTop: 20 }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            {['성함', '진료의', '구분', '약침/패키지구분', '다음내원메모', '통화내역', '초진일', '재내원1', '재내원2', '재내원3', '자보약1', '자보약2', '자보약3', '메모'].map((h) => (
              <th key={h} style={{ ...cellStyle, textAlign: 'left' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <tr key={p.id}>
              <td style={cellStyle}>
                <input defaultValue={p.patientName} onBlur={(e) => handleNameUpdate(p.id, e.target.value)} style={textInputStyle} />
              </td>
              <td style={cellStyle}>
                <select value={p.doctorStaffId ?? ''} onChange={(e) => handleDoctorUpdate(p.id, e.target.value)} style={selectStyle}>
                  <option value=""></option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </td>
              <td style={cellStyle}>
                <select
                  value={p.patientType}
                  onChange={(e) => handleTypeUpdate(p.id, e.target.value as HappyCallPatient['patientType'])}
                  style={selectStyle}
                >
                  {PATIENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </td>
              <td style={cellStyle}>
                <select value={p.acupunctureSuccess ?? ''} onChange={(e) => handleSuccessUpdate(p.id, e.target.value as '성공' | '실패' | '비포함' | '')} style={selectStyle}>
                  <option value=""></option>
                  {PACKAGE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </td>
              <td style={cellStyle}>
                <input defaultValue={p.nextVisitNote ?? ''} onBlur={(e) => handleFieldUpdate(p.id, 'nextVisitNote', e.target.value)} style={{ ...textInputStyle, minWidth: 200 }} />
              </td>
              <td style={cellStyle}>
                <input defaultValue={p.callLog ?? ''} onBlur={(e) => handleFieldUpdate(p.id, 'callLog', e.target.value)} style={{ ...textInputStyle, minWidth: 200 }} />
              </td>
              <td style={cellStyle}>
                <input type="date" defaultValue={p.firstVisitDate} onBlur={(e) => handleDateUpdate(p.id, e.target.value)} style={{ ...textInputStyle, width: 130 }} />
              </td>
              {(['revisit1', 'revisit2', 'revisit3'] as const).map((field) => (
                <td key={field} style={cellStyle}>
                  <input type="date" defaultValue={p[field] ?? ''} onBlur={(e) => handleFieldUpdate(p.id, field, e.target.value)} style={{ ...textInputStyle, width: 130 }} />
                </td>
              ))}
              {(['jaboHerb1', 'jaboHerb2', 'jaboHerb3'] as const).map((field) => (
                <td key={field} style={cellStyle}>
                  <input type="date" defaultValue={p[field] ?? ''} onBlur={(e) => handleFieldUpdate(p.id, field, e.target.value)} style={{ ...textInputStyle, width: 130 }} />
                </td>
              ))}
              <td style={cellStyle}>
                <input defaultValue={p.memo ?? ''} onBlur={(e) => handleFieldUpdate(p.id, 'memo', e.target.value)} style={{ ...textInputStyle, minWidth: 120 }} />
              </td>
            </tr>
          ))}

          {/* 언제든 이어서 입력할 수 있는 빈 줄 — 이름과 초진일이 채워지면 바로 저장되고 다시 빈 줄이 남는다. */}
          <tr style={{ background: '#fafdf9' }}>
            <td style={cellStyle}>
              <input
                value={draft.patientName}
                onChange={(e) => setDraft((d) => ({ ...d, patientName: e.target.value }))}
                onBlur={() => commitDraftIfReady()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitDraftIfReady();
                }}
                placeholder="+ 환자 이름"
                style={textInputStyle}
              />
            </td>
            <td style={cellStyle}>
              <select
                value={draft.doctorStaffId}
                onChange={(e) => setDraft((d) => ({ ...d, doctorStaffId: e.target.value }))}
                style={selectStyle}
              >
                <option value="">진료의</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </td>
            <td style={cellStyle}>
              <select
                value={draft.patientType}
                onChange={(e) => setDraft((d) => ({ ...d, patientType: e.target.value as HappyCallPatient['patientType'] }))}
                style={selectStyle}
              >
                {PATIENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </td>
            <td style={cellStyle} colSpan={3} className="muted-text">
              이름 + 초진일 입력하면 자동 저장돼요
            </td>
            <td style={cellStyle}>
              <input
                type="date"
                value={draft.firstVisitDate}
                onChange={(e) => setDraft((d) => ({ ...d, firstVisitDate: e.target.value }))}
                onBlur={() => commitDraftIfReady()}
                style={{ ...textInputStyle, width: 130 }}
              />
            </td>
            <td style={cellStyle} colSpan={7}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
