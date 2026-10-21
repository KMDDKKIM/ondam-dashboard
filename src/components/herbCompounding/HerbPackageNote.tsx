'use client';

import { useEffect, useMemo, useState } from 'react';
import { packageNote } from '@/lib/herbPackage';
import type { PackageBalance } from '@/lib/herbPackage';
import { createClient } from '@/lib/supabase/client';
import { loadPackageBalance } from '@/lib/supabase/herbPackages';

// 처방전 화면의 한약 패키지(3개월=90일분 등 선결제) 잔여 안내 — 환자를 고르면 잔여 일수와, 이번 처방을 내보낸 뒤 남는 일수를 보여 준다.
// 패키지가 없는 환자에게는 아무것도 안 보인다(원장 요청, 2026-10-21).
export function HerbPackageNote({ patientName, chartNo, orderId, thisDays }: { patientName: string; chartNo: string; orderId: string; thisDays: number }) {
  const supabase = useMemo(() => createClient(), []);
  const [balance, setBalance] = useState<PackageBalance | null>(null);

  useEffect(() => {
    if (!patientName.trim() && !chartNo.trim()) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      loadPackageBalance(supabase, { patientName, chartNo }, orderId || undefined).then(
        (b) => {
          if (!cancelled) setBalance(b);
        },
        () => {
          // 패키지 표를 아직 안 만들었거나 읽기에 실패해도 처방전 작성은 그대로 된다.
          if (!cancelled) setBalance(null);
        }
      );
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [supabase, patientName, chartNo, orderId]);

  const note = packageNote(balance, thisDays);
  if (!note) return null;
  const warn = note.level === 'warn';
  return (
    <p
      style={{
        margin: '0 0 12px',
        padding: '6px 10px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        background: warn ? 'rgba(209, 69, 59, 0.1)' : 'var(--color-surface-2)',
        color: warn ? 'var(--color-error)' : 'var(--color-teal-deep)',
      }}
    >
      📦 {note.text}
    </p>
  );
}
