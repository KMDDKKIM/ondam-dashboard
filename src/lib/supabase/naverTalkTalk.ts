import type { SupabaseClient } from '@supabase/supabase-js';

/** 안읽은(read_at이 비어 있는) 네이버톡톡 이벤트 수(상단바 배지). 조회에 실패하면 null. */
export async function countUnreadNaverTalkTalk(supabase: SupabaseClient): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from('naver_talktalk_events')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null);
    // count가 null이면(테이블이 아직 없을 때 error 없이 null로 오는 경우가 있다) 실패로 본다.
    return error || count == null ? null : count;
  } catch {
    return null;
  }
}

/** 안읽은 네이버톡톡 이벤트를 전부 읽음 처리한다(네이버톡톡 아이콘을 누를 때). */
export async function markNaverTalkTalkRead(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.from('naver_talktalk_events').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (error) throw error;
}
