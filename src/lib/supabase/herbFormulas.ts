import type { SupabaseClient } from '@supabase/supabase-js';
import type { HerbLine } from '@/lib/herbCompounding';
import type { FormulaImportRow, HerbFormula, SourceCount } from '@/lib/herbFormulas';
import { countBySource } from '@/lib/herbFormulas';

interface Row {
  id: string;
  name: string;
  name_hanja: string;
  source: string;
  indication?: string | null;
  herbs: HerbLine[] | null;
  memo: string;
}

function rowToFormula(r: Row): HerbFormula {
  return { id: r.id, name: r.name, nameHanja: r.name_hanja, source: r.source, indication: r.indication ?? '', herbs: Array.isArray(r.herbs) ? r.herbs : [], memo: r.memo };
}

// PostgREST 필터 문자열에서 쓰이는 문자(쉼표·괄호·따옴표)와 LIKE 와일드카드를 검색어에서 뺀다.
function cleanQuery(q: string): string {
  return q.replace(/[,()"%_\*]/g, ' ').trim();
}

const SELECT = 'id, name, name_hanja, source, indication, herbs, memo';

export interface FormulaSearch {
  /** 처방명(한글·한자)에 들어갈 글 */
  query?: string;
  /** 이 약재가 전부 들어 있는 처방만 */
  include?: string[];
  /** 이 약재가 하나도 안 들어 있는 처방만 */
  exclude?: string[];
}

// 배열 리터럴({a,b})에 넣을 약재 이름 — 쉼표·괄호·따옴표·중괄호는 뺀다.
function arrayLiteral(names: string[]): string {
  return `{${names.map((n) => n.replace(/[,{}()"\\]/g, '')).filter(Boolean).join(',')}}`;
}

/**
 * 처방집 검색 — 처방명, 포함 약재, 제외 약재를 함께 걸 수 있다. 조건이 하나도 없으면 빈 목록.
 * 약재 이름은 정확히 같은 것만 센다(herb_names 칸). limit 보다 더 있으면 hasMore.
 */
export async function searchHerbFormulas(supabase: SupabaseClient, search: FormulaSearch, limit = 40): Promise<{ rows: HerbFormula[]; hasMore: boolean }> {
  const q = cleanQuery(search.query ?? '');
  const include = (search.include ?? []).map((n) => n.trim()).filter(Boolean);
  const exclude = (search.exclude ?? []).map((n) => n.trim()).filter(Boolean);
  if (!q && include.length === 0 && exclude.length === 0) return { rows: [], hasMore: false };
  let query = supabase.from('herb_formulas').select(SELECT);
  if (q) query = query.or(`name.ilike.%${q}%,name_hanja.ilike.%${q}%`);
  if (include.length > 0) query = query.contains('herb_names', include);
  for (const name of exclude) query = query.not('herb_names', 'cs', arrayLiteral([name]));
  const { data, error } = await query.order('name', { ascending: true }).limit(limit + 1);
  if (error) throw error;
  const rows = ((data ?? []) as Row[]).map(rowToFormula);
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function countHerbFormulas(supabase: SupabaseClient): Promise<number | null> {
  const { count, error } = await supabase.from('herb_formulas').select('id', { count: 'exact', head: true });
  return error ? null : (count ?? 0);
}

export async function findHerbFormula(supabase: SupabaseClient, name: string, source: string): Promise<HerbFormula | null> {
  const { data, error } = await supabase.from('herb_formulas').select(SELECT).eq('name', name).eq('source', source).maybeSingle();
  if (error) throw error;
  return data ? rowToFormula(data as Row) : null;
}

/** 처방집에 처방 하나를 넣는다(같은 처방명+출전이 있으면 덮어쓴다). */
export async function saveHerbFormula(
  supabase: SupabaseClient,
  input: { name: string; nameHanja?: string; source?: string; herbs: HerbLine[]; createdBy: string | null }
): Promise<void> {
  const { error } = await supabase.from('herb_formulas').upsert(
    {
      name: input.name.trim(),
      name_hanja: (input.nameHanja ?? '').trim(),
      source: (input.source ?? '').trim(),
      herbs: input.herbs,
      created_by: input.createdBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'name,source' }
  );
  if (error) throw error;
}

/**
 * 가져온 처방들을 한꺼번에 넣는다(같은 처방명+출전은 덮어쓴다). 100개씩 나눠 보내고, 한 묶음이 끝날 때마다 onProgress(넣은 수, 전체 수)를 부른다.
 */
export async function importHerbFormulas(
  supabase: SupabaseClient,
  rows: FormulaImportRow[],
  createdBy: string | null,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const now = new Date().toISOString();
  let saved = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100).map((r) => ({
      name: r.name,
      name_hanja: r.nameHanja,
      source: r.source,
      indication: r.indication,
      memo: r.memo,
      herbs: r.herbs,
      created_by: createdBy,
      updated_at: now,
    }));
    const { error } = await supabase.from('herb_formulas').upsert(chunk, { onConflict: 'name,source' });
    if (error) throw error;
    saved += chunk.length;
    onProgress?.(saved, rows.length);
  }
  return saved;
}

export async function deleteHerbFormula(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from('herb_formulas').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('지우지 못했어요.');
}

const SOURCE_PAGE = 1000;

/** 처방집에 든 출전별 처방 수. 출전 칸만 1,000개씩 나눠 읽어 센다. */
export async function listFormulaSources(supabase: SupabaseClient): Promise<SourceCount[]> {
  const sources: string[] = [];
  for (let from = 0; ; from += SOURCE_PAGE) {
    const { data, error } = await supabase
      .from('herb_formulas')
      .select('source')
      .order('id', { ascending: true })
      .range(from, from + SOURCE_PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { source: string | null }[];
    for (const r of rows) sources.push(r.source ?? '');
    if (rows.length < SOURCE_PAGE) break;
  }
  return countBySource(sources);
}

/**
 * 한 출전의 처방을 모두 지운다. 한꺼번에 지우다 시간이 초과되지 않게 300개씩 나눠 지우고, 묶음마다 onProgress(지운 수)를 부른다.
 * 처방집에서 지울 뿐이라 이미 저장한 한약 처방전에는 영향이 없다.
 */
export async function deleteFormulasBySource(supabase: SupabaseClient, source: string, onProgress?: (deleted: number) => void): Promise<number> {
  let deleted = 0;
  for (;;) {
    const { data, error } = await supabase.from('herb_formulas').select('id').eq('source', source).limit(300);
    if (error) throw error;
    const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) return deleted;
    const { data: gone, error: deleteError } = await supabase.from('herb_formulas').delete().in('id', ids).select('id');
    if (deleteError) throw deleteError;
    // RLS 등으로 한 개도 못 지웠으면 같은 묶음을 계속 읽는 무한 반복이 되므로 멈춘다.
    if (!gone || gone.length === 0) throw new Error('지우지 못했어요(권한을 확인해 주세요).');
    deleted += gone.length;
    onProgress?.(deleted);
  }
}
