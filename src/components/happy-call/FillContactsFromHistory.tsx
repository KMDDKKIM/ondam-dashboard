'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { listVisitHistoryContacts } from '@/lib/supabase/patientVisitHistory';
import { updateHappyCallPatient } from '@/lib/supabase/happyCallPatients';
import { planContactFill, type ContactFillPlan } from '@/lib/happyCallContactFill';
import type { HappyCallPatient } from '@/lib/types';

// 차트번호·연락처가 비어 있는 해피콜 환자를, 위 "내원 이력 가져오기"로 저장해 둔 이력에서 이름+초진일로
// 찾아 채운다. 미리보기로 몇 명이 채워지는지 먼저 보여 주고, 확인했을 때만 저장한다. 이미 적힌 값은 건드리지 않는다.
export function FillContactsFromHistory({ patients, onDone }: { patients: HappyCallPatient[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<ContactFillPlan | null>(null);
  const [historyEmpty, setHistoryEmpty] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const missingCount = patients.filter((p) => !(p.chartNo ?? '').trim() || !(p.phone ?? '').trim()).length;

  async function preview() {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const history = await listVisitHistoryContacts(createClient());
      setHistoryEmpty(history.length === 0);
      setPlan(
        planContactFill(
          patients.map((p) => ({ id: p.id, patientName: p.patientName, chartNo: p.chartNo, phone: p.phone, firstVisitDate: p.firstVisitDate })),
          history
        )
      );
    } catch {
      setError('내원 이력을 불러오지 못했어요.');
    } finally {
      setBusy(false);
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
          차트번호나 연락처가 비어 있는 환자 {missingCount}명 · 위에서 저장한 내원 이력과 이름·초진일로 맞춰요
        </span>
        <button type="button" onClick={preview} disabled={busy || missingCount === 0} style={{ fontSize: 13, padding: '4px 12px', marginLeft: 'auto' }}>
          {busy && !plan ? '확인 중...' : '채울 수 있는지 확인'}
        </button>
      </div>

      {historyEmpty && (
        <p className="muted-text" style={{ fontSize: 13, marginTop: 8 }}>
          저장된 내원 이력이 없어요. 위의 &quot;내원 이력 가져오기&quot;에 OK차트 표를 먼저 붙여넣어 저장해 주세요.
        </p>
      )}

      {plan && !historyEmpty && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>
            {plan.fills.length}명을 채울 수 있어요
            <span className="muted-text" style={{ fontWeight: 400 }}>
              {' '}
              · 같은 이름이 여럿이라 건너뜀 {plan.ambiguous}명 · 이력에서 못 찾음 {plan.notFound}명
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
