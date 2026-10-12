'use client';

import { useEffect, useRef, useState } from 'react';
import { confirmDialog } from '@/lib/confirmDialog';
import type { HerbCompoundingOrder } from '@/lib/herbCompounding';
import { summarizeFormulaHerbs } from '@/lib/herbFormulas';
import { createClient } from '@/lib/supabase/client';
import { listHerbCompoundingOrdersForPatient } from '@/lib/supabase/herbCompounding';

interface Props {
  value: HerbCompoundingOrder;
  onChange: (next: HerbCompoundingOrder) => void;
}

function shortDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${y.slice(2)}.${Number(m)}.${Number(d)}`;
}

// 환자를 고르거나 이름을 적으면, 전에 이 화면에서 저장(인쇄할 때 자동 저장 포함)한 같은 환자의 처방전들을 처방명과 함께
// 보여 준다(원장 요청, 2026-10-12). 누르면 그 처방의 약재·처방명으로 채운다. 이름이 같아도 차트번호를 적었으면 차트번호가 같은 것만.
export function PatientHistory({ value, onChange }: Props) {
  const [orders, setOrders] = useState<HerbCompoundingOrder[]>([]);
  const [open, setOpen] = useState(true);
  const requestId = useRef(0);
  const name = value.patientName.trim();
  const chartNo = value.chartNo.trim();

  useEffect(() => {
    if (!name) {
      setOrders([]);
      return;
    }
    const id = ++requestId.current;
    const timer = window.setTimeout(() => {
      listHerbCompoundingOrdersForPatient(createClient(), name, chartNo, value.id)
        .then((rows) => {
          if (id === requestId.current) setOrders(rows);
        })
        .catch(() => {
          if (id === requestId.current) setOrders([]);
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [name, chartNo, value.id]);

  if (orders.length === 0) return null;

  async function apply(order: HerbCompoundingOrder) {
    const filled = value.herbs.filter((h) => h.herbName.trim() !== '' || h.gramsPerPacket > 0).length;
    if (filled > 0 && !(await confirmDialog(`지금 넣어 둔 약재 ${filled}개를 ${shortDate(order.orderDate)} 처방의 약재 ${order.herbs.length}개로 바꿀까요?`, { confirmLabel: '바꾸기' }))) return;
    onChange({
      ...value,
      prescriptionName: order.prescriptionName || value.prescriptionName,
      herbs: order.herbs.map((h) => ({ herbName: h.herbName, prepMethod: h.prepMethod, gramsPerPacket: h.gramsPerPacket })),
    });
  }

  return (
    <div style={{ margin: '-4px 0 14px', padding: '8px 12px', borderRadius: 10, background: 'var(--color-surface-2)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ border: 'none', background: 'none', padding: 0, fontWeight: 700, fontSize: 13, textAlign: 'left' }}
      >
        📋 {name}님의 이전 처방 {orders.length}건 {open ? '▲' : '▼'}
      </button>
      {open && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0' }}>
          {orders.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => apply(o)}
                title="이 처방의 약재로 채우기"
                style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '6px 4px', borderTop: '1px solid var(--color-line)', cursor: 'pointer' }}
              >
                <div style={{ fontSize: 13 }}>
                  <span className="muted-text">{shortDate(o.orderDate)}</span>{' '}
                  <strong>{o.prescriptionName || '(처방명 없음)'}</strong>
                  <span className="muted-text"> · {o.packetCount}첩 · 약재 {o.herbs.filter((h) => h.herbName.trim() !== '').length}개</span>
                </div>
                <div className="muted-text" style={{ fontSize: 12, marginTop: 1 }}>
                  {summarizeFormulaHerbs(o.herbs.filter((h) => h.herbName.trim() !== ''), 8)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <p className="muted-text" style={{ fontSize: 11, margin: '4px 0 0' }}>누르면 그 처방의 약재로 채워요(첩수·탕전 정보는 그대로).</p>}
    </div>
  );
}
