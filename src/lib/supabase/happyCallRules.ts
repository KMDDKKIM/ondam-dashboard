import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_RULES, normalizeRules, type HappyCallRules } from '@/lib/happyCallRules';

// 해피콜 규칙(happy_call_rules, 한 줄) 읽기·저장. 읽는 건 승인된 직원 모두, 저장은 원장만(RLS). 규칙을 한 번도 저장하지 않았거나
// 표를 아직 만들지 않았으면 코드의 기본 규칙(지금까지 쓰던 방식)을 쓴다.

const TABLE = 'happy_call_rules';

export interface RulesState {
  rules: HappyCallRules;
  /** 규칙을 저장한 적이 있는가(없으면 기본 규칙) */
  saved: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  /** 마지막으로 "아직 안 건 해피콜에도 적용"을 누른 시각 */
  appliedAt: string | null;
}

const DEFAULT_STATE: RulesState = { rules: DEFAULT_RULES, saved: false, updatedAt: null, updatedBy: null, appliedAt: null };

/** 화면용: 저장 상태까지. 읽기에 실패하면(표가 아직 없는 등) 기본 규칙. */
export async function loadRulesState(supabase: SupabaseClient): Promise<RulesState> {
  try {
    const { data, error } = await supabase.from(TABLE).select('config, updated_by, updated_at, applied_at').eq('id', 'main').maybeSingle();
    if (error || !data) return DEFAULT_STATE;
    return {
      rules: normalizeRules(data.config),
      saved: true,
      updatedAt: (data.updated_at as string | null) ?? null,
      updatedBy: (data.updated_by as string | null) ?? null,
      appliedAt: (data.applied_at as string | null) ?? null,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

/** 해피콜을 만들 때 쓰는 규칙. 읽지 못해도 해피콜은 만들어져야 하니 기본 규칙으로 대신한다. */
export async function loadRules(supabase: SupabaseClient): Promise<HappyCallRules> {
  return (await loadRulesState(supabase)).rules;
}

/** 규칙을 저장한다(원장만 가능 — 아니면 RLS가 막아 던진다). */
export async function saveRules(supabase: SupabaseClient, rules: HappyCallRules, by: string | null): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ id: 'main', config: normalizeRules(rules), updated_by: by, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw error;
}

/** "아직 안 건 해피콜에도 적용"을 마쳤다고 기록한다. */
export async function markRulesApplied(supabase: SupabaseClient): Promise<void> {
  await supabase.from(TABLE).update({ applied_at: new Date().toISOString() }).eq('id', 'main');
}
