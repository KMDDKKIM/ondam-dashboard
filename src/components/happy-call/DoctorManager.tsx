'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addDoctor, renameDoctor, setDoctorActive, type Doctor } from '@/lib/supabase/doctors';

interface Props {
  doctors: Doctor[];
  isOwner: boolean;
  onChanged: () => Promise<void> | void;
}

const smallBtn = {
  border: 'none',
  background: 'transparent',
  color: 'var(--color-muted)',
  fontSize: 12,
  fontWeight: 600,
  padding: 0,
} as const;

// 진료의 목록 관리 — 초진환자 해피콜의 진료의 선택, 통계 필터, 시트 붙여넣기가 이 목록을 쓴다.
// 대표원장만 고칠 수 있고(다른 직원은 보기만), 지우지 않고 "숨김"으로 빼서 예전 기록의 이름은 그대로 남는다.
export function DoctorManager({ doctors, isOwner, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [error, setError] = useState('');
  const supabase = createClient();

  async function run(action: () => Promise<void>) {
    setError('');
    try {
      await action();
      await onChanged();
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : '처리하지 못했어요.';
      setError(message.includes('duplicate') || message.includes('unique') ? '이미 있는 이름이에요.' : message);
    }
  }

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    if (doctors.some((d) => d.name === name)) return setError('이미 있는 이름이에요.');
    run(async () => {
      await addDoctor(supabase, name, doctors);
      setNewName('');
    });
  }

  function handleRename(id: string) {
    const name = renameText.trim();
    if (!name) return;
    if (doctors.some((d) => d.id !== id && d.name === name)) return setError('이미 있는 이름이에요.');
    run(async () => {
      await renameDoctor(supabase, id, name);
      setRenamingId(null);
    });
  }

  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ border: 'none', background: 'transparent', color: 'var(--color-ink)', fontWeight: 700, fontSize: 14, padding: 0 }}
      >
        🩺 진료의 관리 ({doctors.filter((d) => d.active).length}명) {open ? '▲' : '▼'}
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <p className="muted-text" style={{ fontSize: 12, marginBottom: 10 }}>
            진료의 선택 칸, 통계 필터, 구글시트 붙여넣기가 이 목록을 써요. 지우지 않고 "숨김"으로 빼면 그 진료의로 등록된 예전 기록의
            이름은 그대로 남아요.{!isOwner && ' (수정은 대표원장만 할 수 있어요)'}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: isOwner ? 12 : 0 }}>
            {doctors.map((d) =>
              renamingId === d.id ? (
                <span key={d.id} style={{ display: 'inline-flex', gap: 4 }}>
                  <input
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(d.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="input-field"
                    style={{ width: 130, padding: '4px 8px' }}
                    autoFocus
                  />
                  <button type="button" onClick={() => handleRename(d.id)} className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }}>
                    저장
                  </button>
                  <button type="button" onClick={() => setRenamingId(null)} style={smallBtn}>
                    취소
                  </button>
                </span>
              ) : (
                <span
                  key={d.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 12px',
                    borderRadius: 999,
                    border: '1px solid var(--color-line)',
                    background: d.active ? 'var(--color-surface-2)' : 'transparent',
                    color: d.active ? 'var(--color-ink)' : 'var(--color-muted)',
                    fontSize: 13,
                    textDecoration: d.active ? 'none' : 'line-through',
                  }}
                >
                  {d.name}
                  {!d.active && <span style={{ fontSize: 11, textDecoration: 'none' }}>(숨김)</span>}
                  {isOwner && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(d.id);
                          setRenameText(d.name);
                        }}
                        style={smallBtn}
                      >
                        이름 수정
                      </button>
                      <button
                        type="button"
                        onClick={() => run(() => setDoctorActive(supabase, d.id, !d.active))}
                        style={{ ...smallBtn, color: d.active ? 'var(--color-error)' : 'var(--color-blue)' }}
                      >
                        {d.active ? '숨김' : '다시 보이기'}
                      </button>
                    </>
                  )}
                </span>
              )
            )}
            {doctors.length === 0 && <span className="muted-text">등록된 진료의가 없어요.</span>}
          </div>

          {isOwner && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="새 진료의 이름"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd();
                }}
                className="input-field"
                style={{ maxWidth: 200 }}
              />
              <button type="button" onClick={handleAdd} className="btn-primary" style={{ padding: '8px 16px' }}>
                추가
              </button>
            </div>
          )}
          {error && <p className="error-text">{error}</p>}
        </div>
      )}
    </div>
  );
}
