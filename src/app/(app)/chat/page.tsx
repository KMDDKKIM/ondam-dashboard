'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { listRoomsWithUnread, markRoomRead } from '@/lib/supabase/chatRooms';
import { ChatRoomList } from '@/components/chat/ChatRoomList';
import { ChatThread } from '@/components/chat/ChatThread';
import type { ChatRoomWithUnread } from '@/lib/types';

export default function ChatPage() {
  const [rooms, setRooms] = useState<ChatRoomWithUnread[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  async function loadRooms(): Promise<ChatRoomWithUnread[]> {
    const roomList = await listRoomsWithUnread(supabase);
    setRooms(roomList);
    return roomList;
  }

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setStaffId(user?.id ?? null);
      const roomList = await loadRooms();
      if (roomList.length > 0) {
        setSelectedRoomId(roomList[0].id);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSelectRoom(roomId: string) {
    setSelectedRoomId(roomId);
    if (staffId) {
      await markRoomRead(supabase, roomId, staffId);
      await loadRooms();
    }
  }

  async function handleRoomCreated() {
    await loadRooms();
  }

  if (loading) return <p>불러오는 중...</p>;

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 120px)' }}>
      <ChatRoomList
        rooms={rooms}
        selectedRoomId={selectedRoomId}
        onSelectRoom={handleSelectRoom}
        onRoomCreated={handleRoomCreated}
      />
      {selectedRoomId && staffId ? (
        <ChatThread roomId={selectedRoomId} staffId={staffId} />
      ) : (
        <div className="card" style={{ flex: 1, padding: 24 }}>
          <p className="muted-text">아직 방이 없습니다. 왼쪽에서 새 방을 만들어보세요.</p>
        </div>
      )}
    </div>
  );
}
