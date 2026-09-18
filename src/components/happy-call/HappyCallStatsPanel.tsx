'use client';

import { useMemo, useState } from 'react';
import { computeFirstVisitStats, computeWeeklyTrend, getWeekRange } from '@/lib/happyCallStats';
import type { HappyCallPatient, Staff } from '@/lib/types';

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function formatMaturityGatedPercent(rate: number, matureCount: number): string {
  return matureCount === 0 ? '-' : formatPercent(rate);
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

  // 진료의별 주별 추이 — 선택한 진료의(없으면 전체)를 기준으로 최근 5주를
  // 거슬러 본다. 시트의 "진료의별 통계"에 해당.
  const trendSourcePatients = useMemo(
    () => (doctorId ? patients.filter((p) => p.doctorStaffId === doctorId) : patients),
    [patients, doctorId]
  );
  const weeklyTrend = useMemo(
    () => computeWeeklyTrend(trendSourcePatients, referenceDate, today, 5),
    [trendSourcePatients, referenceDate, today]
  );
  const doctorLabel = doctorId ? staffList.find((s) => s.id === doctorId)?.name ?? '선택 진료의' : '전체 진료의';

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
            <td style={cellStyle}>성숙 환자수(3주 경과)</td>
            <td style={cellStyle}>{doctorStats.matureCount}</td>
            <td style={cellStyle}>{clinicStats.matureCount}</td>
          </tr>
          <tr>
            <td style={cellStyle}>재진율</td>
            <td style={cellStyle}>{formatPercent(doctorStats.revisitRate)}</td>
            <td style={cellStyle}>{formatPercent(clinicStats.revisitRate)}</td>
          </tr>
          <tr>
            <td style={cellStyle}>이탈률</td>
            <td style={cellStyle}>{formatMaturityGatedPercent(doctorStats.dropoutRate, doctorStats.matureCount)}</td>
            <td style={cellStyle}>{formatMaturityGatedPercent(clinicStats.dropoutRate, clinicStats.matureCount)}</td>
          </tr>
          <tr>
            <td style={cellStyle}>삼진율</td>
            <td style={cellStyle}>{formatMaturityGatedPercent(doctorStats.tripleVisitRate, doctorStats.matureCount)}</td>
            <td style={cellStyle}>{formatMaturityGatedPercent(clinicStats.tripleVisitRate, clinicStats.matureCount)}</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 14, marginBottom: 8 }}>주별 추이 ({doctorLabel})</h3>
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={cellStyle}></th>
              {weeklyTrend.map((point) => (
                <th key={point.start} style={cellStyle}>
                  {point.start.slice(5)}~{point.end.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={cellStyle}>초진환자수</td>
              {weeklyTrend.map((point) => (
                <td key={point.start} style={cellStyle}>{point.stats.patientCount}</td>
              ))}
            </tr>
            <tr>
              <td style={cellStyle}>재진율</td>
              {weeklyTrend.map((point) => (
                <td key={point.start} style={cellStyle}>{formatPercent(point.stats.revisitRate)}</td>
              ))}
            </tr>
            <tr>
              <td style={cellStyle}>이탈률</td>
              {weeklyTrend.map((point) => (
                <td key={point.start} style={cellStyle}>
                  {formatMaturityGatedPercent(point.stats.dropoutRate, point.stats.matureCount)}
                </td>
              ))}
            </tr>
            <tr>
              <td style={cellStyle}>삼진율</td>
              {weeklyTrend.map((point) => (
                <td key={point.start} style={cellStyle}>
                  {formatMaturityGatedPercent(point.stats.tripleVisitRate, point.stats.matureCount)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

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
              <td style={cellStyle}>{formatMaturityGatedPercent(stats.dropoutRate, stats.matureCount)}</td>
              <td style={cellStyle}>{formatMaturityGatedPercent(stats.tripleVisitRate, stats.matureCount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
