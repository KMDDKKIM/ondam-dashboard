import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { countOpenCalls } from './happyCallWorklist';

/**
 * 오늘 걸 해피콜 수(예정일 ≤ 오늘인 미완료 콜, 목록과 같은 정의)와 그중 연체 수. 조회에 실패하면 throw 한다.
 * 같은 요청 안에서 메뉴 배지와 홈이 함께 부르므로 React cache 로 한 번만 읽는다.
 */
export const getOpenCallCounts = cache(async (today: string) => {
  const supabase = await createClient();
  return countOpenCalls(supabase, today);
});
