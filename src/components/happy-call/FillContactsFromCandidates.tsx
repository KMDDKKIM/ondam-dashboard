'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { updateHappyCallPatient } from '@/lib/supabase/happyCallPatients';
import { planContactFill, type ContactFillPlan, type HistoryContact } from '@/lib/happyCallContactFill';
import type { FirstVisitCandidatesResult } from '@/lib/firstVisit';
import type { HappyCallPatient } from '@/lib/types';

const CONCURRENCY = 4;

// 차트번호·연락처가 비어 있는 환자를, 그 환자의 초진일에 일일결산·예약 명단에서 뽑은 내원 환자(위 초진 후보 목록과
// 같은 자료)에서 이름으로 찾아 채운다. 접수기록부에는 차트번호·연락처가 없어서, 그날 일일결산·예약 명단에
// 같은 사람이 있을 때만 채울 수 있다(없으면 수동 입력). 미리보기 후 확인해야 저장하고, 이미 적힌 값은 건드리지 않는다.
export function FillContactsFromCandidates({ patients, onDone }: { patients: HappyCallPatient[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [plan, setPlan] = useState<ContactFillPlan | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const missing = patients.filter((p) => !(p.chartNo ?? '').trim() || !(p.phone ?? '').trim());

  async function preview() {
    setBusy(true);
    setMessage('');
    setError('');
    setPlan(null);
    try {
      const dates = [...new Set(missing.map((p) => p.firstVisitDate))].sort();
      const source: HistoryContact[] = [];
      let done = 0;
      for (let i = 0; i < dates.length; i += CONCURRENCY) {
        await Promise.all(
          dates.slice(i, i + CONCURRENCY).map(async (date) => {
            const response = await fetch(`/api/first-visit-candidates?date=${encodeURIComponent(date)}`);
            if (response.ok) {
              const json = (await response.json()) as FirstVisitCandidatesResult;
              for (const c of json.candidates) {
                // 차트번호가 있는 후보만 쓴다(접수기록부에서 온 이름뿐인 후보는 채울 값이 없다).
                if (!c.chartNo) continue;
                source.push({ chartNo: c.chartNo, patientName: c.patientName, phone: c.phone || null, registeredDate: date, firstVisit: date });
              }
            }
            done++;
            setProgress(`${done}/${dates.length}일 확인 중...`);
          })
        );
      }
      setPlan(
        planContactFill(
          missing.map((p) => ({ id: p.id, patientName: p.patientName, chartNo: p.chartNo, phone: p.phone, firstVisitDate: p.firstVisitDate })),
          source
        )
      );
    } catch {
      setError('후보 정보를 불러오지 못했어요.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function apply() {
    if (!plan || plan.fills.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const supabase = createClient();
      for (const fill of plan.fills) {
        const patch: { chartNo?: string; phone?: string } = {};
        if (fill.chartNo) patch.chartNo = fill.chartNo;
        if (fill.phone) patch.phone = fill.phone;
        await updateHappyCallPatient(supabase, fill.id, patch);
      }
      setMessage(`${plan.fills.length}명의 차트번호·연락처를 채웠어요.`);
      setPlan(null);
      onDone();
    } catch {
      setError('채우던 중 저장에 실패했어요. 화면을 새로고침해서 어디까지 채워졌는지 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>📇 비어 있는 차트번호·연락처 채우기</span>
        <span className="muted-text" style={{ fontSize: 12 }}>
          비어 있는 환자 {missing.length}명 · 초진일의 일일결산·예약 명단에서 같은 이름을 찾아 채워요(접수기록부에는 번호가 없어요)
        </span>
        <button type="button" onClick={preview} disabled={busy || missing.length === 0} style={{ fontSize: 13, padding: '4px 12px', marginLeft: 'auto' }}>
          {busy && !plan ? progress || '확인 중...' : '채울 수 있는지 확인'}
        </button>
      </div>

      {plan && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>
            {plan.fills.length}명을 채울 수 있어요
            <span className="muted-text" style={{ fontWeight: 400 }}>
              {' '}
              · 같은 이름이 여럿이라 건너뜀 {plan.ambiguous}명 · 일일결산·예약 명단에서 못 찾음 {plan.notFound}명(수동 입력)
            </span>
          </p>
          <button type="button" className="btn-primary" onClick={apply} disabled={busy || plan.fills.length === 0} style={{ padding: '6px 16px', fontSize: 13 }}>
            {busy ? '채우는 중...' : `${plan.fills.length}명 채우기`}
          </button>
        </div>
      )}

      {message && <p style={{ color: 'var(--color-teal-deep)', fontSize: 13, marginTop: 8 }}>{message}</p>}
      {error && <p className="error-text" style={{ marginTop: 6 }}>{error}</p>}
    </div>
  );
}
