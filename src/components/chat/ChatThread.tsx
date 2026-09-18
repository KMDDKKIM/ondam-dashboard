'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { listMessages, sendMessage, subscribeToRoomMessages } from '@/lib/supabase/chatMessages';
import type { ChatMessage } from '@/lib/types';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB — 개별 파일 크기 상한(스펙 §11의 미정 항목에 대한 V1 기본값)

interface ChatThreadProps {
  roomId: string;
  staffId: string;
}

export function ChatThread({ roomId, staffId }: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const supabase = createClient();

  async function loadMessages() {
    const list = await listMessages(supabase, roomId);
    setMessages(list);
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('staff').select('id, name');
      const map: Record<string, string> = {};
      (data ?? []).forEach((s: { id: string; name: string }) => {
        map[s.id] = s.name;
      });
      setStaffNames(map);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setMessages([]);
    loadMessages();
    const unsubscribe = subscribeToRoomMessages(supabase, roomId, () => {
      loadMessages();
    });
    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    const tooLarge = selected.find((f) => f.size > MAX_FILE_SIZE);
    if (tooLarge) {
      setError(`${tooLarge.name}은(는) 10MB를 넘어 첨부할 수 없습니다.`);
      return;
    }
    setError('');
    setFiles(selected);
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!content.trim() && files.length === 0) return;
    setSending(true);
    setError('');
    try {
      await sendMessage(supabase, {
        roomId,
        senderId: staffId,
        content: content.trim() || null,
        files,
      });
      setContent('');
      setFiles([]);
      await loadMessages();
    } catch {
      setError('메시지를 보내지 못했습니다.');
    } finally {
      setSending(false);
    }
  }

  function senderLabel(senderId: string | null): string {
    if (senderId === staffId) return '나';
    if (senderId && staffNames[senderId]) return staffNames[senderId];
    return '알 수 없음';
  }

  return (
    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16 }}>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((message) => (
          <div key={message.id} style={{ padding: '6px 0' }}>
            <div className="muted-text" style={{ fontSize: 11, marginBottom: 2 }}>
              {senderLabel(message.senderId)} · {message.createdAt.slice(11, 16)}
            </div>
            {message.content && <div style={{ fontSize: 14 }}>{message.content}</div>}
            {message.attachments.map((attachment) => (
              <div key={attachment.id} style={{ marginTop: 4 }}>
                {attachment.fileType.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={attachment.fileUrl} alt={attachment.fileName} style={{ maxWidth: 240, borderRadius: 8 }} />
                ) : (
                  <a
                    href={attachment.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--color-blue)', fontSize: 13 }}
                  >
                    📎 {attachment.fileName}
                  </a>
                )}
              </div>
            ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <p className="error-text">{error}</p>}

      <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-end' }}>
        <input type="file" multiple onChange={handleFileChange} style={{ maxWidth: 140 }} />
        <input
          className="input-field"
          placeholder="메시지 입력"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={sending} className="btn-primary">
          전송
        </button>
      </form>
    </div>
  );
}
