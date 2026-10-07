import type { SupabaseClient } from '@supabase/supabase-js';
import type { HerbLine } from '@/lib/herbCompounding';
import type { FormulaImportRow, HerbFormula } from '@/lib/herbFormulas';

interface Row {
  id: string;
  name: string;
  name_hanja: string;
  source: string;
  herbs: HerbLine[] | null;
  memo: string;
}

function rowToFormula(r: Row): HerbFormula {
  return { id: r.id, name: r.name, nameHanja: r.name_hanja, source: r.source, herbs: Array.isArray(r.herbs) ? r.herbs : [], memo: r.memo };
}

// PostgREST 필터 문자열에서 쓰이는 문자(쉼표·괄호·따옴표)와 LIKE 와일드카드를 검색어에서 뺀다.
function cleanQuery(q: string): string {
  return q.replace(/[,()"%_\*]/g, ' ').trim();
}

/** 처방명(한글·한자)에 검색어가 들어간 처방을 이름순으로. 검색어가 비면 빈 목록. */
export async function searchHerbFormulas(supabase: SupabaseClient, query: string, limit = 30): Promise<HerbFormula[]> {
  const q = cleanQuery(query);
  if (!q) return [];
  const { data, error } = await supabase
    .from('herb_formulas')
    .select('id, name, name_hanja, source, herbs, memo')
    .or(`name.ilike.%${q}%,name_hanja.ilike.%${q}%`)
    .order('name', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Row[]).map(rowToFormula);
}

export async function countHerbFormulas(supabase: SupabaseClient): Promise<number | null> {
  const { count, error } = await supabase.from('herb_formulas').select('id', { count: 'exact', head: true });
  return error ? null : (count ?? 0);
}

export async function findHerbFormula(supabase: SupabaseClient, name: string, source: string): Promise<HerbFormula | null> {
  const { data, error } = await supabase.from('herb_formulas').select('id, name, name_hanja, source, herbs, memo').eq('name', name).eq('source', source).maybeSingle();
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

/** 붙여넣어 가져온 처방들을 한꺼번에 넣는다(같은 처방명+출전은 덮어쓴다). 200개씩 나눠 보낸다. */
export async function importHerbFormulas(supabase: SupabaseClient, rows: FormulaImportRow[], createdBy: string | null): Promise<number> {
  const now = new Date().toISOString();
  let saved = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => ({
      name: r.name,
      name_hanja: r.nameHanja,
      source: r.source,
      herbs: r.herbs,
      created_by: createdBy,
      updated_at: now,
    }));
    const { error } = await supabase.from('herb_formulas').upsert(chunk, { onConflict: 'name,source' });
    if (error) throw error;
    saved += chunk.length;
  }
  return saved;
}

export async function deleteHerbFormula(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from('herb_formulas').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('지우지 못했어요.');
}
