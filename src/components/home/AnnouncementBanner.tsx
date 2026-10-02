'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { confirmDialog } from '@/lib/confirmDialog';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  pinAnnouncement,
  type Announcement,
} from '@/lib/supabase/announcements';

// "오늘의 한마디"를 대체한 자리 — 표시 중인 공지 1건을 압축해서 보여주고, "관리"를 펼치면
// 승인된 직원이면 누구나 새 글을 쓰고 표시할 글을 고를 수 있다(원장 요청, 2026-10-02).
export function AnnouncementBanner() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      setAnnouncements(await listAnnouncements(supabase));
    } catch {
      setError('공지사항을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayed = announcements.find((a) => a.isPinned) ?? announcements[0] ?? null;

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;
    setPosting(true);
    setError('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await createAnnouncement(supabase, newContent.trim(), user?.id ?? null);
      setNewContent('');
      await load();
    } catch {
      setError('등록하지 못했습니다.');
    } finally {
      setPosting(false);
    }
  }

  async function handlePin(id: string) {
    setBusyId(id);
    setError('');
    try {
      await pinAnnouncement(supabase, id);
      await load();
    } catch {
      setError('표시하지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirmDialog('이 공지를 삭제할까요?'))) return;
    setBusyId(id);
    setError('');
    try {
      await deleteAnnouncement(supabase, id);
      await load();
    } catch {
      setError('삭제하지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return null;

  return (
    <div className="card" style={{ padding: '16px 20px', marginBottom: 20, borderLeft: '4px solid var(--color-brand-b)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--color-brand-b)', marginBottom: 6 }}>
            <span>📌</span>
            <span>공지사항</span>
          </div>
          {displayed ? (
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16, whiteSpace: 'pre-wrap' }}>{displayed.content}</p>
          ) : (
            <p className="muted-text" style={{ margin: 0 }}>등록된 공지가 없어요.</p>
          )}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{ flexShrink: 0, border: 'none', background: 'transparent', color: 'var(--color-muted)', fontSize: 13, fontWeight: 600 }}
        >
          {open ? '접기' : '관리'}
        </button>
      </div>

      {error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-line)' }}>
          <form onSubmit={handlePost} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              className="input-field"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="새 공지 작성"
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn-primary" disabled={posting || !newContent.trim()} style={{ padding: '7px 16px' }}>
              {posting ? '등록 중...' : '등록'}
            </button>
          </form>

          {announcements.length === 0 ? (
            <p className="muted-text">아직 등록된 공지가 없어요.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {announcements.map((a) => (
                <li
                  key={a.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '8px 0',
                    borderBottom: '1px solid var(--color-line)',
                  }}
                >
                  <span style={{ flex: 1, fontSize: 13, whiteSpace: 'pre-wrap', fontWeight: a.isPinned ? 700 : 400 }}>
                    {a.isPinned && <span style={{ color: 'var(--color-brand-b)' }}>📌 </span>}
                    {a.content}
                  </span>
                  <span className="muted-text" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                    {a.createdAt.slice(0, 10)}
                  </span>
                  {!a.isPinned && (
                    <button
                      type="button"
                      onClick={() => handlePin(a.id)}
                      disabled={busyId === a.id}
                      style={{ border: 'none', background: 'transparent', color: 'var(--color-brand-b)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
                    >
                      표시
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(a.id)}
                    disabled={busyId === a.id}
                    style={{ border: 'none', background: 'transparent', color: 'var(--color-error)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
