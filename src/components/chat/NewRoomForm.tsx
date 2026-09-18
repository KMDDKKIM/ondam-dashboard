'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createChatRoom } from '@/lib/supabase/chatRooms';
import type { Staff } from '@/lib/types';

interface NewRoomFormProps {
  onClose: () => void;
  onCreated: () => void;
}

export function NewRoomForm({ onClose, onCreated }: NewRoomFormProps) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'topic' | 'chat'>('topic');
  const [isPublic, setIsPublic] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('staff').select('id, name, role');
      setStaffList((data ?? []) as Staff[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleStaff(id: string) {
    setSelectedStaffIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await createChatRoom(supabase, {
        name: name.trim(),
        kind,
        isPublic,
        memberStaffIds: isPublic ? [] : selectedStaffIds,
        createdBy: user?.id ?? null,
      });
      onCreated();
    } catch {
      setError('방을 만들지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="card"
        style={{ width: 320, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <h3 style={{ fontSize: 16 }}>새 방 만들기</h3>
        <input
          className="input-field"
          placeholder="방 이름"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <select
          className="input-field"
          value={kind}
          onChange={(event) => setKind(event.target.value as 'topic' | 'chat')}
        >
          <option value="topic">토픽</option>
          <option value="chat">채팅</option>
        </select>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
          전체 직원 공개방
        </label>

        {!isPublic && (
          <div
            style={{
              maxHeight: 160,
              overflowY: 'auto',
              border: '1px solid var(--color-line)',
              borderRadius: 8,
              padding: 8,
            }}
          >
            {staffList.map((staff) => (
              <label key={staff.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '4px 0' }}>
                <input
                  type="checkbox"
                  checked={selectedStaffIds.includes(staff.id)}
                  onChange={() => toggleStaff(staff.id)}
                />
                {staff.name}
              </label>
            ))}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '8px 14px', border: '1px solid var(--color-line)', borderRadius: 10, background: 'none' }}
          >
            취소
          </button>
          <button type="submit" disabled={submitting} className="btn-primary">
            만들기
          </button>
        </div>
      </form>
    </div>
  );
}
