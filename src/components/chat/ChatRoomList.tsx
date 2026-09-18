'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { searchMessages } from '@/lib/supabase/chatMessages';
import { groupRoomsByKind } from '@/lib/chatHelpers';
import type { ChatRoomWithUnread, ChatSearchResult } from '@/lib/types';

interface ChatRoomListProps {
  rooms: ChatRoomWithUnread[];
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  onRoomCreated: () => void;
}

export function ChatRoomList({ rooms, selectedRoomId, onSelectRoom, onRoomCreated }: ChatRoomListProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChatSearchResult[] | null>(null);

  const supabase = createClient();
  const { topics, chats } = groupRoomsByKind(rooms);

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    const results = await searchMessages(supabase, query.trim());
    setSearchResults(results);
  }

  function closeSearch() {
    setSearchResults(null);
    setQuery('');
  }

  function roomButton(room: ChatRoomWithUnread) {
    return (
      <button
        key={room.id}
        onClick={() => onSelectRoom(room.id)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          padding: '8px 10px',
          border: 'none',
          borderRadius: 8,
          background: selectedRoomId === room.id ? 'var(--color-surface-2)' : 'transparent',
          fontWeight: room.unreadCount > 0 ? 700 : 400,
          fontSize: 14,
          textAlign: 'left',
        }}
      >
        <span>{room.name}</span>
        {room.unreadCount > 0 && (
          <span
            style={{
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              borderRadius: 9,
              background: 'var(--color-error)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {room.unreadCount > 99 ? '99+' : room.unreadCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className="card"
      style={{ width: 280, padding: 12, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}
    >
      <form onSubmit={handleSearch}>
        <input
          className="input-field"
          placeholder="메시지 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>

      {searchResults ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="muted-text">검색 결과 {searchResults.length}건</span>
            <button
              onClick={closeSearch}
              style={{ border: 'none', background: 'none', fontSize: 12, color: 'var(--color-blue)' }}
            >
              닫기
            </button>
          </div>
          {searchResults.map((result) => (
            <button
              key={result.messageId}
              onClick={() => {
                onSelectRoom(result.roomId);
                closeSearch();
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                border: 'none',
                borderRadius: 8,
                background: 'transparent',
                marginBottom: 4,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600 }}>{result.roomName}</div>
              <div className="muted-text" style={{ fontSize: 12 }}>
                {result.content}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>토픽</span>
          </div>
          {topics.map(roomButton)}

          <span style={{ fontWeight: 700, fontSize: 13, marginTop: 8 }}>채팅</span>
          {chats.map(roomButton)}
        </>
      )}
    </div>
  );
}
