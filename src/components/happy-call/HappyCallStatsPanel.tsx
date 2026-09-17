'use client';

import { useMemo, useState } from 'react';
import { computeFirstVisitStats, getWeekRange } from '@/lib/happyCallStats';
import type { HappyCallPatient, Staff } from '@/lib/types';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

const cellStyle = { border: '1px solid #ddd', padding: 6 };

export function HappyCallStatsPanel({ patients, staffList }: { patients: HappyCallPatient[]; staffList: Staff[] }) {
  const [referenceDate, setReferenceDate] = useState(todayISO());
  const [doctorId, setDoctorId] = useState('');
  const today = todayISO();

  const { start, end } = useMemo(() => getWeekRange(referenceDate), [referenceDate]);

  const weekPatients = useMemo(
    () => patients.filter((p) => p.firstVisitDate >= start && p.firstVisitDate <= end),
    [patients, start, end]
  );

  const clinicStats = useMemo(() => computeFirstVisitStats(weekPatients, today), [weekPatients, today]);

  const doctorPatients = useMemo(
    () => (doctorId ? weekPatients.filter((p) => p.doctorStaffId === doctorId) : weekPatients),
    [weekPatients, doctorId]
  );
  const doctorStats = useMemo(() => computeFirstVisitStats(doctorPatients, today), [doctorPatients, today]);

  const byPatientType = useMemo(() => {
    const types: HappyCallPatient['patientType'][] = ['건보', '자보', '비급여'];
    return types.map((type) => ({
      type,
      stats: computeFirstVisitStats(
        weekPatients.filter((p) => p.patientType === type),
        today
      ),
    }));
  }, [weekPatients, today]);

  return (
    <div style={{ marginTop: 32, border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>주별 통계</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} />
        <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          <option value="">전체 진료의</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 13, color: '#666' }}>
          {start} ~ {end}
        </span>
      </div>

      <table style={{ borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={cellStyle}></th>
            <th style={cellStyle}>선택 진료의</th>
            <th style={cellStyle}>한의원 전체</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={cellStyle}>초진환자수</td>
            <td style={cellStyle}>{doctorStats.patientCount}</td>
            <td style={cellStyle}>{clinicStats.patientCount}</td>
          </tr>
          <tr>
            <td style={cellStyle}>재진율</td>
            <td style={cellStyle}>{formatPercent(doctorStats.revisitRate)}</td>
            <td style={cellStyle}>{formatPercent(clinicStats.revisitRate)}</td>
          </tr>
          <tr>
            <td style={cellStyle}>이탈률</td>
            <td style={cellStyle}>{formatPercent(doctorStats.dropoutRate)}</td>
            <td style={cellStyle}>{formatPercent(clinicStats.dropoutRate)}</td>
          </tr>
          <tr>
            <td style={cellStyle}>삼진율</td>
            <td style={cellStyle}>{formatPercent(doctorStats.tripleVisitRate)}</td>
            <td style={cellStyle}>{formatPercent(clinicStats.tripleVisitRate)}</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 14, marginBottom: 8 }}>환자구분별</h3>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={cellStyle}>구분</th>
            <th style={cellStyle}>초진환자수</th>
            <th style={cellStyle}>재진율</th>
            <th style={cellStyle}>이탈률</th>
            <th style={cellStyle}>삼진율</th>
          </tr>
        </thead>
        <tbody>
          {byPatientType.map(({ type, stats }) => (
            <tr key={type}>
              <td style={cellStyle}>{type}</td>
              <td style={cellStyle}>{stats.patientCount}</td>
              <td style={cellStyle}>{formatPercent(stats.revisitRate)}</td>
              <td style={cellStyle}>{formatPercent(stats.dropoutRate)}</td>
              <td style={cellStyle}>{formatPercent(stats.tripleVisitRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
