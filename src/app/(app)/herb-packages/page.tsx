'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PackageOverviewRow } from '@/lib/herbPackage';
import { koDate } from '@/lib/dietScripts';
import { createClient } from '@/lib/supabase/client';
import { loadPackageOverview } from '@/lib/supabase/herbPackages';

const th = { padding: '6px 8px', fontSize: 12, textAlign: 'left', color: 'var(--color-muted)', whiteSpace: 'nowrap' } as const;
const td = { padding: '6px 8px', fontSize: 13, whiteSpace: 'nowrap' } as const;

// 한약 패키지 현황(전 직원 공용) — 3개월(90일)·1개월(30일) 선결제 환자의 결제 일수, 처방한 일수, 남은 일수를 한눈에(원장 요청, 2026-10-21).
// 비급여 현황에서 한약을 30일 이상으로 등록하면 패키지가 만들어지고, 처방전을 출력할 때마다 며칠분이 차감된다. 새로 결제한 환자부터 보인다.
export default function HerbPackagesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<PackageOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUsedUp, setShowUsedUp] = useState(false);

  useEffect(() => {
    loadPackageOverview(supabase)
      .then((r) => {
        setRows(r);
        setError('');
      })
      .catch(() => setError('한약 패키지를 불러오지 못했어요. (한약 패키지 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)'))
      .finally(() => setLoading(false));
  }, [supabase]);

  const remaining = rows.filter((r) => r.remainingDays > 0);
  const usedUp = rows.filter((r) => r.remainingDays === 0);
  const shown = showUsedUp ? rows : remaining;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>한약 패키지 현황</h1>
      <p className="muted-text" style={{ margin: '0 0 14px', fontSize: 13 }}>
        3개월(90일분)·1개월(30일분) 선결제 환자의 남은 일수예요. 비급여 현황에서 한약을 등록할 때 처방일수를 30일 이상으로 넣으면 만들어지고, 처방전을 <b>출력</b>할 때마다 며칠분이 차감돼요. 새로 결제한 환자부터 보여요.
      </p>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted-text">불러오는 중…</p>}

      {!loading && !error && (
        <>
          <p style={{ fontSize: 13, margin: '0 0 8px' }}>
            남은 일수가 있는 환자 <b>{remaining.length}명</b>
            {usedUp.length > 0 && (
              <label style={{ marginLeft: 14, fontSize: 12 }}>
                <input type="checkbox" checked={showUsedUp} onChange={(e) => setShowUsedUp(e.target.checked)} /> 다 쓴 환자 {usedUp.length}명도 보기
              </label>
            )}
          </p>
          {shown.length === 0 ? (
            <p className="muted-text">{rows.length === 0 ? '아직 한약 패키지가 없어요.' : '남은 일수가 있는 환자가 없어요.'}</p>
          ) : (
            <div className="card" style={{ padding: 8, overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    {['환자', '결제일', '결제 일수', '처방한 일수', '남은 일수', '마지막 처방일'].map((h) => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const warn = r.remainingDays <= 14;
                    return (
                      <tr key={`${r.chartNo}|${r.patientName}`} style={{ borderTop: '1px solid var(--color-line)', opacity: r.remainingDays === 0 ? 0.65 : 1 }}>
                        <td style={{ ...td, fontWeight: 700 }}>
                          {r.patientName}
                          {r.chartNo && <span className="muted-text" style={{ fontSize: 11, fontWeight: 400 }}> {r.chartNo}</span>}
                        </td>
                        <td style={td}>
                          {koDate(r.firstPaidDate)}
                          {r.packageCount > 1 && <span className="muted-text" style={{ fontSize: 11 }}> 외 {r.packageCount - 1}회 추가 결제</span>}
                        </td>
                        <td style={td}>{r.totalDays}일</td>
                        <td style={td}>{r.usedDays}일</td>
                        <td style={{ ...td, fontWeight: 700, color: warn ? 'var(--color-error)' : undefined }}>
                          {r.overDays > 0 ? `${r.overDays}일 초과` : `${r.remainingDays}일`}
                          {warn && r.remainingDays > 0 && <span style={{ fontSize: 11, fontWeight: 400 }}> · 곧 소진</span>}
                        </td>
                        <td style={td}>{r.lastOrderDate ? koDate(r.lastOrderDate) : '처방 전'}</td>
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
