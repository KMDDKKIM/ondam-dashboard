'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, computeFirstVisitStats, computeWeeklyTrend, getWeekRange, lastCompletedWeekRange, latestFullyMatureWeekStart } from '@/lib/happyCallStats';
import { todayKst } from '@/lib/kst';
import type { HappyCallPatient, Staff } from '@/lib/types';

const TYPE_FILTERS: (HappyCallPatient['patientType'] | '')[] = ['', '건보', '자보', '비급여'];
const TYPE_FILTER_LABEL: Record<HappyCallPatient['patientType'] | '', string> = {
  '': '전체',
  건보: '건보',
  자보: '자보',
  비급여: '비급여',
};

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function formatMaturityGatedPercent(rate: number, matureCount: number): string {
  return matureCount === 0 ? '-' : formatPercent(rate);
}

// 이탈률·삼진율은 3주가 지난 환자만 센다. 일부만 지났으면 "100% (2/20명)"처럼 몇 명 기준인지 함께 보여 준다.
function formatMatureBased(rate: number, stats: { patientCount: number; matureCount: number }): string {
  if (stats.matureCount === 0) return '-';
  return stats.matureCount < stats.patientCount
    ? `${formatPercent(rate)} (${stats.matureCount}/${stats.patientCount}명)`
    : formatPercent(rate);
}

// 재진율은 전체(초진 후 3주가 안 지난 환자 포함)를 분모로 쳐서 항상 바로 보여 준다 — 3주가 안
// 지난 환자도 그새 재진할 수 있어서 이탈률처럼 아예 숨길 필요는 없다. 다만 그 안에 아직
// 3주가 안 지난 환자가 섞여 있으면(matureCount < patientCount) 앞으로 더 오를 수 있는, 아직
// 판단하기 이른 숫자라는 뜻이라 옅게 보여 준다(원장 요청, 2026-09-24).
function revisitCellStyle(stats: { patientCount: number; matureCount: number }) {
  return stats.matureCount < stats.patientCount ? { ...cellStyle, color: 'var(--color-muted)' } : cellStyle;
}

const cellStyle = { border: '1px solid #eee', padding: '3px 6px', fontSize: 11 };
const weekButtonStyle = { padding: '3px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', fontSize: 11, fontWeight: 600 } as const;
const cardStyle = { flex: '1 1 260px', minWidth: 260, padding: 10 } as const;

interface HappyCallStatsPanelProps {
  patients: HappyCallPatient[];
  staffList: Staff[];
  onDateClick?: (date: string) => void;
}

export function HappyCallStatsPanel({ patients, staffList, onDateClick }: HappyCallStatsPanelProps) {
  // 처음엔 가장 최근에 끝난 한 주(월~일)를 보여 준다 — 이번 주는 3주 성숙 전이라 이탈/삼진이 늘 "-"가 되기 때문.
  const [referenceDate, setReferenceDate] = useState(() => lastCompletedWeekRange(todayKst()).start);
  const [doctorId, setDoctorId] = useState('');
  const [typeFilter, setTypeFilter] = useState<HappyCallPatient['patientType'] | ''>('');
  const today = todayKst();

  useEffect(() => {
    onDateClick?.(referenceDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceDate]);

  const { start, end } = useMemo(() => getWeekRange(referenceDate), [referenceDate]);

  const typeFilteredPatients = useMemo(
    () => (typeFilter ? patients.filter((p) => p.patientType === typeFilter) : patients),
    [patients, typeFilter]
  );

  const weekPatients = useMemo(
    () => typeFilteredPatients.filter((p) => p.firstVisitDate >= start && p.firstVisitDate <= end),
    [typeFilteredPatients, start, end]
  );
  // 환자구분별 카드는 위쪽 구분 필터와 무관하게 항상 건보/자보/비급여를 나란히
  // 비교해서 보여준다.
  const weekPatientsAllTypes = useMemo(
    () => patients.filter((p) => p.firstVisitDate >= start && p.firstVisitDate <= end),
    [patients, start, end]
  );

  const clinicStats = useMemo(() => computeFirstVisitStats(weekPatients, today), [weekPatients, today]);

  const doctorPatients = useMemo(
    () => (doctorId ? weekPatients.filter((p) => p.doctorStaffId === doctorId) : weekPatients),
    [weekPatients, doctorId]
  );
  const doctorStats = useMemo(() => computeFirstVisitStats(doctorPatients, today), [doctorPatients, today]);

  // 진료의별 비교 — 선택한 주·구분 필터 기준으로 진료의 전원을 나란히.
  const perDoctor = useMemo(
    () =>
      staffList.map((s) => ({
        id: s.id,
        name: s.name,
        stats: computeFirstVisitStats(
          weekPatients.filter((p) => p.doctorStaffId === s.id),
          today
        ),
      })),
    [staffList, weekPatients, today]
  );

  const byPatientType = useMemo(() => {
    const types: HappyCallPatient['patientType'][] = ['건보', '자보', '비급여'];
    return types.map((type) => ({
      type,
      stats: computeFirstVisitStats(
        weekPatientsAllTypes.filter((p) => p.patientType === type),
        today
      ),
    }));
  }, [weekPatientsAllTypes, today]);

  // 진료의별 주별 추이 — 선택한 진료의(없으면 전체)와 구분 필터를 기준으로 최근
  // 5주를 거슬러 본다. 시트의 "진료의별 통계"에 해당.
  const trendSourcePatients = useMemo(
    () => (doctorId ? typeFilteredPatients.filter((p) => p.doctorStaffId === doctorId) : typeFilteredPatients),
    [typeFilteredPatients, doctorId]
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
        <button type="button" onClick={() => setReferenceDate(lastCompletedWeekRange(today).start)} style={weekButtonStyle}>
          지난주
        </button>
        <button type="button" onClick={() => setReferenceDate(today)} style={weekButtonStyle}>
          이번주
        </button>
        <button
          type="button"
          onClick={() => setReferenceDate(latestFullyMatureWeekStart(today))}
          style={weekButtonStyle}
          title="이탈률·삼진율이 그 주 환자 전원 기준으로 나오는 가장 최근 주"
        >
          이탈·삼진 집계되는 주
        </button>
        <div style={{ display: 'flex', gap: 4 }}>
          {TYPE_FILTERS.map((t) => (
            <button
              key={t || 'all'}
              type="button"
              onClick={() => setTypeFilter(t)}
              style={{
                padding: '3px 10px',
                borderRadius: 999,
                border: '1px solid #ddd',
                background: typeFilter === t ? '#2c8fd6' : '#fff',
                color: typeFilter === t ? '#fff' : '#333',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {TYPE_FILTER_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
        초진에는 재초진(마지막 내원 후 3개월 이상)도 포함돼요. 이탈률·삼진율은 초진 후 3주가 지난 환자만 집계하며(삼진 = 초진 후 3주 안에 3번 내원),
        이 주의 마지막 환자는 {addDays(end, 21)} 부터 집계돼요.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="card" style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>{start.slice(5)} ~ {end.slice(5)} 주 ({doctorLabel} / 전체)</div>
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
                <td style={revisitCellStyle(doctorStats)}>{formatPercent(doctorStats.revisitRate)}</td>
                <td style={revisitCellStyle(clinicStats)}>{formatPercent(clinicStats.revisitRate)}</td>
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

        <div className="card" style={{ ...cardStyle, flex: '2 1 420px' }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>
            진료의별 비교 ({start.slice(5)} ~ {end.slice(5)} 주)
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={cellStyle}>진료의</th>
                <th style={cellStyle}>초진수</th>
                <th style={cellStyle}>재진율</th>
                <th style={cellStyle}>이탈률</th>
                <th style={cellStyle}>삼진율</th>
              </tr>
            </thead>
            <tbody>
              {[...perDoctor, { id: 'all', name: '전체', stats: clinicStats }].map(({ id, name, stats }) => (
                <tr key={id} style={id === 'all' ? { fontWeight: 700, background: '#fafafa' } : undefined}>
                  <td style={cellStyle}>{name}</td>
                  <td style={cellStyle}>{stats.patientCount}</td>
                  <td style={stats.patientCount === 0 ? cellStyle : revisitCellStyle(stats)}>{stats.patientCount === 0 ? '-' : formatPercent(stats.revisitRate)}</td>
                  <td style={cellStyle}>{formatMatureBased(stats.dropoutRate, stats)}</td>
                  <td style={cellStyle}>{formatMatureBased(stats.tripleVisitRate, stats)}</td>
                </tr>
              ))}
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
                    <td key={point.start} style={point.stats.patientCount === 0 ? cellStyle : revisitCellStyle(point.stats)}>{point.stats.patientCount === 0 ? '-' : formatPercent(point.stats.revisitRate)}</td>
                  ))}
                </tr>
                <tr>
                  <td style={cellStyle}>이탈률</td>
                  {weeklyTrend.map((point) => (
                    <td key={point.start} style={cellStyle}>{formatMatureBased(point.stats.dropoutRate, point.stats)}</td>
                  ))}
                </tr>
                <tr>
                  <td style={cellStyle}>삼진율</td>
                  {weeklyTrend.map((point) => (
                    <td key={point.start} style={cellStyle}>{formatMatureBased(point.stats.tripleVisitRate, point.stats)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>환자구분별 (선택한 주)</div>
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
                  <td style={revisitCellStyle(stats)}>{formatPercent(stats.revisitRate)}</td>
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
