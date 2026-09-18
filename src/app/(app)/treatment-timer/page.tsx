'use client';

import { useEffect, useState } from 'react';
import { TREATMENT_CATALOG } from '@/lib/treatmentCatalog';

const BED_COUNT = 8;

interface Bed {
  id: number;
  patientName: string;
  checkedItems: string[];
  remainingSeconds: number;
  running: boolean;
  startedAt: string | null;
}

function emptyBed(id: number): Bed {
  return { id, patientName: '', checkedItems: [], remainingSeconds: 0, running: false, startedAt: null };
}

function totalSeconds(names: string[]): number {
  return names.reduce((sum, name) => {
    const item = TREATMENT_CATALOG.find((t) => t.name === name);
    return sum + (item ? item.minutes * 60 : 0);
  }, 0);
}

function formatTime(seconds: number): string {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(seconds) % 60;
  const sign = seconds < 0 ? '-' : '';
  return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function nowLabel(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function statusOf(bed: Bed): { label: string; color: string } {
  if (!bed.patientName) return { label: '비어있음', color: 'var(--color-muted)' };
  if (bed.running) return { label: '진행 중', color: 'var(--color-teal)' };
  if (bed.checkedItems.length > 0 && bed.remainingSeconds <= 0) return { label: '완료', color: 'var(--color-error)' };
  return { label: '대기 중', color: 'var(--color-gold)' };
}

export default function TreatmentTimerPage() {
  const [beds, setBeds] = useState<Bed[]>(() => Array.from({ length: BED_COUNT }, (_, i) => emptyBed(i + 1)));

  // 베드마다 따로 타이머를 두지 않고, 1초마다 한 번씩 "진행 중"인 베드들의
  // 남은 시간을 같이 줄인다 — 8개 setInterval을 따로 두는 것보다 간단하다.
  useEffect(() => {
    const tick = setInterval(() => {
      setBeds((prev) =>
        prev.map((bed) => {
          if (!bed.running) return bed;
          const next = bed.remainingSeconds - 1;
          if (next <= 0) {
            return { ...bed, remainingSeconds: 0, running: false };
          }
          return { ...bed, remainingSeconds: next };
        })
      );
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  function updateBed(id: number, patch: Partial<Bed>) {
    setBeds((prev) => prev.map((bed) => (bed.id === id ? { ...bed, ...patch } : bed)));
  }

  function toggleItem(bed: Bed, itemName: string) {
    const checked = bed.checkedItems.includes(itemName);
    const nextItems = checked
      ? bed.checkedItems.filter((n) => n !== itemName)
      : [...bed.checkedItems, itemName];
    // 진행 중이 아니면 남은 시간을 체크한 항목 합계로 다시 맞춘다. 진행 중이면
    // 지금 남은 시간에 그 항목 분만큼만 더하거나 뺀다 (타이머를 처음부터 다시
    // 돌리지 않기 위해).
    if (!bed.running) {
      updateBed(bed.id, { checkedItems: nextItems, remainingSeconds: totalSeconds(nextItems) });
    } else {
      const item = TREATMENT_CATALOG.find((t) => t.name === itemName);
      const delta = (item?.minutes ?? 0) * 60 * (checked ? -1 : 1);
      updateBed(bed.id, {
        checkedItems: nextItems,
        remainingSeconds: Math.max(0, bed.remainingSeconds + delta),
      });
    }
  }

  function start(bed: Bed) {
    if (bed.checkedItems.length === 0) return;
    updateBed(bed.id, {
      running: true,
      startedAt: bed.startedAt ?? nowLabel(),
      remainingSeconds: bed.remainingSeconds > 0 ? bed.remainingSeconds : totalSeconds(bed.checkedItems),
    });
  }

  function pause(bed: Bed) {
    updateBed(bed.id, { running: false });
  }

  function resetTimer(bed: Bed) {
    updateBed(bed.id, { running: false, remainingSeconds: totalSeconds(bed.checkedItems), startedAt: null });
  }

  function clearBed(id: number) {
    setBeds((prev) => prev.map((bed) => (bed.id === id ? emptyBed(id) : bed)));
  }

  const occupied = beds.filter((b) => b.patientName);

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>치료실 타이머</h1>
      <p className="muted-text" style={{ marginBottom: 20 }}>
        베드에 환자와 치료항목을 배정하고 시간을 재세요.
      </p>

      {occupied.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>지금 치료 중 ({occupied.length}명)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {occupied.map((bed) => {
              const status = statusOf(bed);
              return (
                <div key={bed.id} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                  <span style={{ fontWeight: 700, width: 48 }}>베드{bed.id}</span>
                  <span style={{ flex: 1 }}>{bed.patientName}</span>
                  <span className="muted-text">입실 {bed.startedAt ?? '-'}</span>
                  <span style={{ color: status.color, fontWeight: 700 }}>{formatTime(bed.remainingSeconds)}</span>
                  <span style={{ color: status.color, fontWeight: 600 }}>{status.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {beds.map((bed) => {
          const status = statusOf(bed);
          return (
            <div key={bed.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 700 }}>베드{bed.id}</span>
                <span style={{ color: status.color, fontWeight: 700, fontSize: 12 }}>{status.label}</span>
              </div>

              <input
                placeholder="환자명"
                value={bed.patientName}
                onChange={(e) => updateBed(bed.id, { patientName: e.target.value })}
                className="input-field"
                style={{ marginBottom: 10 }}
              />

              <div
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  textAlign: 'center',
                  marginBottom: 10,
                  color: bed.running ? 'var(--color-teal)' : 'var(--color-ink)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatTime(bed.remainingSeconds)}
              </div>

              <div style={{ marginBottom: 10 }}>
                {TREATMENT_CATALOG.map((item) => (
                  <label
                    key={item.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      padding: '3px 0',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={bed.checkedItems.includes(item.name)}
                      onChange={() => toggleItem(bed, item.name)}
                    />
                    <span style={{ flex: 1 }}>{item.name}</span>
                    <span className="muted-text">{item.minutes}분</span>
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                {bed.running ? (
                  <button
                    onClick={() => pause(bed)}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      fontSize: 13,
                      borderRadius: 10,
                      border: '1px solid var(--color-line)',
                      background: 'var(--color-surface-2)',
                      fontWeight: 600,
                    }}
                  >
                    일시정지
                  </button>
                ) : (
                  <button
                    onClick={() => start(bed)}
                    disabled={bed.checkedItems.length === 0 || !bed.patientName}
                    className="btn-primary"
                    style={{ flex: 1, padding: '8px 0', fontSize: 13 }}
                  >
                    시작
                  </button>
                )}
                <button
                  onClick={() => resetTimer(bed)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    fontSize: 13,
                    borderRadius: 10,
                    border: '1px solid var(--color-line)',
                    background: 'var(--color-surface-2)',
                    fontWeight: 600,
                  }}
                >
                  초기화
                </button>
              </div>
              <button
                onClick={() => clearBed(bed.id)}
                style={{
                  width: '100%',
                  padding: '6px 0',
                  fontSize: 12,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-muted)',
                }}
              >
                베드 비우기
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
