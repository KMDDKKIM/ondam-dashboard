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

const cellStyle = { border: '1px solid #eee', padding: '3px 6px', fontSize: 11 };
const cardStyle = { flex: '1 1 260px', minWidth: 260, padding: 10 } as const;

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
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} style={{ fontSize: 12, padding: 3 }} />
        <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} style={{ fontSize: 12, padding: 3 }}>
          <option value="">전체 진료의</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: '#888' }}>
          {start} ~ {end}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="card" style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>이번주 ({doctorLabel} / 전체)</div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={cellStyle}></th>
                <th style={cellStyle}>선택</th>
                <th style={cellStyle}>전체</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={cellStyle}>초진수</td>
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
        </div>

        <div className="card" style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>주별 추이 ({doctorLabel})</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={cellStyle}></th>
                  {weeklyTrend.map((point) => (
                    <th key={point.start} style={cellStyle}>
                      {point.start.slice(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={cellStyle}>초진수</td>
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
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>환자구분별 (이번주)</div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={cellStyle}>구분</th>
                <th style={cellStyle}>초진수</th>
                <th style={cellStyle}>재진율</th>
                <th style={cellStyle}>이탈률</th>
              </tr>
            </thead>
            <tbody>
              {byPatientType.map(({ type, stats }) => (
                <tr key={type}>
                  <td style={cellStyle}>{type}</td>
                  <td style={cellStyle}>{stats.patientCount}</td>
                  <td style={cellStyle}>{formatPercent(stats.revisitRate)}</td>
                  <td style={cellStyle}>{formatMaturityGatedPercent(stats.dropoutRate, stats.matureCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
