'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { confirmDialog } from '@/lib/confirmDialog';
import type { HerbCompoundingOrder } from '@/lib/herbCompounding';
import { herbsForFormula, parseFormulaImport, parseFormulaJson, splitHerbNameList, summarizeFormulaHerbs, type FormulaImportResult, type HerbFormula } from '@/lib/herbFormulas';
import { createClient } from '@/lib/supabase/client';
import { countHerbFormulas, deleteHerbFormula, findHerbFormula, importHerbFormulas, saveHerbFormula, searchHerbFormulas } from '@/lib/supabase/herbFormulas';

interface Props {
  value: HerbCompoundingOrder;
  onChange: (next: HerbCompoundingOrder) => void;
}

const labelStyle = { display: 'block', fontSize: 12, color: 'var(--color-muted)', marginBottom: 4 } as const;
const linkButton = { border: 'none', background: 'none', textDecoration: 'underline', color: 'var(--color-muted)', fontSize: 12, padding: 0 } as const;

// 처방집 검색 — OK차트 처방집처럼 처방명(한글·한자)을 치면 후보가 뜨고, 누르면 그 처방의 약재 목록으로 채운다
// (원장 요청, 2026-10-07). 처방집은 "붙여넣어 가져오기"나 "현재 약재를 처방집에 저장"으로 쌓는다.
export function FormulaPicker({ value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [includeText, setIncludeText] = useState('');
  const [excludeText, setExcludeText] = useState('');
  const [results, setResults] = useState<HerbFormula[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveSource, setSaveSource] = useState('');
  const [importText, setImportText] = useState('');
  // 파일로 가져올 때는 글을 칸에 펼치지 않고 따로 들고 있는다(수 MB라 칸에 넣으면 화면이 느려진다).
  const [fileText, setFileText] = useState<{ name: string; text: string } | null>(null);
  const [progress, setProgress] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [importSource, setImportSource] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);

  function refreshTotal() {
    countHerbFormulas(createClient()).then(setTotal, () => setTotal(null));
  }

  useEffect(() => {
    refreshTotal();
  }, []);

  const includeNames = splitHerbNameList(includeText);
  const excludeNames = splitHerbNameList(excludeText);
  const hasCondition = query.trim() !== '' || includeNames.length > 0 || excludeNames.length > 0;
  const conditionKey = `${query.trim()}\u0001${includeNames.join(',')}\u0001${excludeNames.join(',')}`;

  // 입력이 멈춘 뒤에 찾는다(늦게 도착한 이전 검색 결과가 덮어쓰지 않게 마지막 요청만 반영).
  useEffect(() => {
    if (!hasCondition) {
      setResults([]);
      setHasMore(false);
      return;
    }
    const id = ++requestId.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchHerbFormulas(createClient(), { query, include: includeNames, exclude: excludeNames })
        .then(({ rows, hasMore: more }) => {
          if (id !== requestId.current) return;
          setResults(rows);
          setHasMore(more);
          setError('');
        })
        .catch(() => {
          if (id !== requestId.current) return;
          setError('처방집을 불러오지 못했어요. (처방집 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
        })
        .finally(() => {
          if (id === requestId.current) setSearching(false);
        });
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conditionKey]);

  async function apply(formula: HerbFormula) {
    const filled = value.herbs.filter((h) => h.herbName.trim() !== '' || h.gramsPerPacket > 0).length;
    if (filled > 0 && !(await confirmDialog(`지금 넣어 둔 약재 ${filled}개를 "${formula.name}" 처방의 약재 ${formula.herbs.length}개로 바꿀까요?`, { confirmLabel: '바꾸기' }))) return;
    onChange({
      ...value,
      prescriptionName: value.prescriptionName.trim() ? value.prescriptionName : formula.name,
      // 한자 이름은 처방전 입력·인쇄에 쓰지 않아 빼고 채운다.
      herbs: formula.herbs.map((h) => ({ herbName: h.herbName, prepMethod: h.prepMethod, gramsPerPacket: h.gramsPerPacket })),
    });
    setNotice(`"${formula.name}" 처방의 약재 ${formula.herbs.length}개를 채웠어요.`);
    setQuery('');
    setIncludeText('');
    setExcludeText('');
    setResults([]);
  }

  async function remove(formula: HerbFormula) {
    if (!(await confirmDialog(`처방집에서 "${formula.name}"${formula.source ? ` (${formula.source})` : ''}을(를) 지울까요?`, { confirmLabel: '삭제' }))) return;
    try {
      await deleteHerbFormula(createClient(), formula.id);
      setResults((prev) => prev.filter((r) => r.id !== formula.id));
      refreshTotal();
    } catch {
      setError('지우지 못했어요.');
    }
  }

  async function saveCurrent() {
    const name = (saveName || value.prescriptionName).trim();
    const herbs = herbsForFormula(value.herbs);
    if (!name) {
      setError('저장할 처방명을 적어 주세요.');
      return;
    }
    if (herbs.length === 0) {
      setError('저장할 약재(이름과 그램)가 없어요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const supabase = createClient();
      const source = saveSource.trim();
      const existing = await findHerbFormula(supabase, name, source);
      if (existing && !(await confirmDialog(`처방집에 이미 "${name}"${source ? ` (${source})` : ''}이(가) 있어요. 지금 약재로 덮어쓸까요?`, { confirmLabel: '덮어쓰기' }))) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await saveHerbFormula(supabase, { name, source, herbs, createdBy: user?.id ?? null });
      setNotice(`"${name}" 처방을 처방집에 저장했어요(약재 ${herbs.length}개).`);
      setSaveName('');
      refreshTotal();
    } catch {
      setError('저장하지 못했어요. (처방집 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
    } finally {
      setBusy(false);
    }
  }

  // 글이 [ 나 { 로 시작하면 JSON(다른 자료에서 정리해 온 처방집), 아니면 한 줄에 한 처방인 글로 읽는다.
  // 큰 파일을 렌더링 때마다 다시 읽지 않도록 글·기본 출전이 바뀔 때만 계산한다.
  const sourceText = fileText ? fileText.text : importText;
  const preview = useMemo<(FormulaImportResult & { error?: string }) | null>(() => {
    if (!sourceText.trim()) return null;
    return /^\s*[[{]/.test(sourceText) ? parseFormulaJson(sourceText, importSource) : parseFormulaImport(sourceText, importSource);
  }, [sourceText, importSource]);

  function readJsonFile(file: File | undefined) {
    if (!file) return;
    file.text().then(
      (text) => {
        setFileText({ name: file.name, text });
        setImportText('');
      },
      () => setError('파일을 읽지 못했어요.')
    );
  }

  async function runImport() {
    if (!preview || preview.rows.length === 0) return;
    setBusy(true);
    setError('');
    setProgress(`0/${preview.rows.length}`);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const saved = await importHerbFormulas(supabase, preview.rows, user?.id ?? null, (done, all) => setProgress(`${done.toLocaleString('ko-KR')}/${all.toLocaleString('ko-KR')}`));
      setNotice(`처방 ${saved.toLocaleString('ko-KR')}개를 처방집에 넣었어요${preview.skipped.length > 0 ? ` (읽지 못한 항목 ${preview.skipped.length}개는 건너뜀)` : ''}.`);
      setImportText('');
      setFileText(null);
      refreshTotal();
    } catch {
      setError('가져오다가 멈췄어요. 같은 파일을 다시 가져오면 이어서 덮어써요. (처방집 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>
        처방집 검색 — 처방명(한글·한자)을 치고 누르면 약재 목록이 채워져요{total != null ? ` · 처방집 ${total.toLocaleString('ko-KR')}개` : ''}
      </label>
      <input
        className="input-field"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setNotice('');
        }}
        placeholder="예: 보중익기탕"
        autoComplete="off"
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        <input
          className="input-field"
          value={includeText}
          onChange={(e) => {
            setIncludeText(e.target.value);
            setNotice('');
          }}
          placeholder="들어간 약재 — 예: 당귀 천궁 (모두 들어간 처방)"
          autoComplete="off"
          style={{ flex: '1 1 200px', padding: '5px 8px', fontSize: 13 }}
        />
        <input
          className="input-field"
          value={excludeText}
          onChange={(e) => {
            setExcludeText(e.target.value);
            setNotice('');
          }}
          placeholder="빼는 약재 — 예: 감초 (하나도 안 든 처방)"
          autoComplete="off"
          style={{ flex: '1 1 200px', padding: '5px 8px', fontSize: 13 }}
        />
      </div>
      {total === 0 && !hasCondition && (
        <p className="muted-text" style={{ fontSize: 12, margin: '6px 0 0' }}>
          처방집이 아직 비어 있어요. 아래 &quot;처방집 관리&quot;에서 OK차트 처방집을 붙여넣어 가져오세요.
        </p>
      )}
      {error && <p className="error-text" style={{ margin: '6px 0 0' }}>{error}</p>}
      {notice && <p style={{ color: 'var(--color-green)', fontSize: 13, margin: '6px 0 0' }}>{notice}</p>}

      {hasCondition && (
        <div className="card" style={{ marginTop: 6, maxHeight: 320, overflowY: 'auto', padding: 4 }}>
          {results.length > 0 && (
            <p className="muted-text" style={{ fontSize: 12, margin: '4px 8px' }}>
              {hasMore ? `${results.length}개 이상` : `${results.length}개`}
              {includeNames.length > 0 && ` · ${includeNames.join('·')} 모두 포함`}
              {excludeNames.length > 0 && ` · ${excludeNames.join('·')} 제외`}
              {hasMore && ' — 조건을 더 좁혀 보세요'}
            </p>
          )}
          {searching && results.length === 0 && <p className="muted-text" style={{ fontSize: 12, margin: 8 }}>찾는 중...</p>}
          {!searching && results.length === 0 && !error && <p className="muted-text" style={{ fontSize: 12, margin: 8 }}>처방집에 없어요.</p>}
          {results.map((f) => (
            <div key={f.id} style={{ borderBottom: '1px solid var(--color-line)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <button
                type="button"
                onClick={() => apply(f)}
                title="이 처방의 약재로 채우기"
                style={{ flex: 1, textAlign: 'left', border: 'none', background: 'none', padding: '7px 8px', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {f.name}
                  {f.nameHanja && <span className="muted-text" style={{ fontWeight: 400, fontSize: 12 }}> ({f.nameHanja})</span>}
                  {f.source && <span className="muted-text" style={{ fontWeight: 500, fontSize: 12 }}> · {f.source}</span>}
                </div>
                {f.indication && <div style={{ fontSize: 12, marginTop: 2 }}>{f.indication.length > 70 ? `${f.indication.slice(0, 70)}…` : f.indication}</div>}
                <div className="muted-text" style={{ fontSize: 12, marginTop: 2 }}>{summarizeFormulaHerbs(f.herbs, 12)}</div>
              </button>
              {f.memo && (
                <button type="button" onClick={() => toggleExpanded(f.id)} style={{ ...linkButton, padding: '9px 4px', whiteSpace: 'nowrap' }}>
                  {expanded.has(f.id) ? '접기' : '자세히'}
                </button>
              )}
              <button type="button" onClick={() => remove(f)} aria-label={`${f.name} 삭제`} style={{ border: 'none', background: 'none', color: 'var(--color-muted)', fontSize: 14, padding: '7px 8px' }}>
                ×
              </button>
            </div>
            {expanded.has(f.id) && f.memo && (
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12, margin: '0 8px 8px', padding: 8, borderRadius: 6, background: 'var(--color-surface-2)', maxHeight: 220, overflowY: 'auto' }}>
                {f.memo}
                {f.herbs.some((h) => h.hanja) ? `\n\n약재(한자): ${f.herbs.map((h) => `${h.herbName}${h.hanja ? `(${h.hanja})` : ''}`).join(' · ')}` : ''}
              </pre>
            )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 6 }}>
        <button type="button" onClick={() => setManageOpen((v) => !v)} style={linkButton}>
          {manageOpen ? '▾' : '▸'} 처방집 관리 (현재 약재 저장 · 붙여넣어 가져오기)
        </button>
      </div>

      {manageOpen && (
        <div className="card" style={{ marginTop: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, margin: '0 0 6px' }}>지금 입력한 약재를 처방집에 저장</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input
                className="input-field"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={value.prescriptionName ? `처방명 (비우면 "${value.prescriptionName}")` : '처방명'}
                style={{ flex: '1 1 160px', padding: '5px 8px', fontSize: 13 }}
              />
              <input
                className="input-field"
                value={saveSource}
                onChange={(e) => setSaveSource(e.target.value)}
                placeholder="출전(선택) 예: 채움생"
                style={{ flex: '1 1 130px', padding: '5px 8px', fontSize: 13 }}
              />
              <button type="button" onClick={saveCurrent} disabled={busy} style={{ fontSize: 13 }}>
                처방집에 저장
              </button>
            </div>
          </div>

          <div>
            <p style={{ fontWeight: 700, fontSize: 13, margin: '0 0 4px' }}>붙여넣어 가져오기 (OK차트 처방집 등)</p>
            <p className="muted-text" style={{ fontSize: 12, margin: '0 0 6px' }}>
              <b>JSON 파일</b>(처방명·한자명·출전·주치·비고·약재[이름·수치·그램])을 고르거나 아래 칸에 붙여 넣어도 돼요. 글이 [ 나 {'{'} 로 시작하면 JSON으로 읽어요.
              <br />
              글로 붙일 때는 한 줄에 한 처방 — <b>처방명 | 출전(선택) | 약재 구성</b>을 탭이나 | 로 나눠요. OK차트 처방집 표를 복사해 붙여도 돼요(처방명·출전·약재 순서).
              약재 구성은 &quot;의이인 12g 부평초 12g 갈근 8g 곤포 길경 황금 8g&quot;처럼 이름 뒤에 그램을 적고, 수치는 &quot;백작약-炒 12g&quot;처럼 -로 붙여요.
              같은 처방명+출전은 덮어써요.
            </p>
            <input type="file" accept=".json,application/json,.txt,.tsv,.csv" onChange={(e) => readJsonFile(e.target.files?.[0])} style={{ fontSize: 12, marginBottom: 6 }} />
            {fileText && (
              <p style={{ fontSize: 12, margin: '0 0 6px' }}>
                📄 {fileText.name} ({Math.round(fileText.text.length / 1024).toLocaleString('ko-KR')}KB){' '}
                <button type="button" onClick={() => setFileText(null)} style={linkButton}>
                  파일 빼기
                </button>
              </p>
            )}
            <textarea
              className="input-field"
              style={{ minHeight: 90, fontSize: 12, display: fileText ? 'none' : undefined }}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'시험탕(試驗湯) | 사상의학 | 가 12g 나 8g 다 라 4g\n보중탕 | 가 6g 나 4g'}
            />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
              <input
                className="input-field"
                value={importSource}
                onChange={(e) => setImportSource(e.target.value)}
                placeholder="출전이 없는 줄의 기본 출전(선택)"
                style={{ flex: '1 1 180px', padding: '5px 8px', fontSize: 13 }}
              />
              <button type="button" onClick={runImport} disabled={busy || !preview || preview.rows.length === 0} className="btn-primary" style={{ fontSize: 13 }}>
                {busy && progress ? `가져오는 중 ${progress}` : preview ? `처방 ${preview.rows.length.toLocaleString('ko-KR')}개 가져오기` : '가져오기'}
              </button>
            </div>
            {preview && (
              <p className={preview.error ? 'error-text' : 'muted-text'} style={{ fontSize: 12, margin: '6px 0 0' }}>
                {preview.error ? preview.error : null}
                {preview.error ? null : `읽은 처방 ${preview.rows.length}개`}
                {!preview.error && preview.rows.some((r) => r.herbs.some((h) => h.gramsPerPacket <= 0)) && ` · 그램을 모르는 약재가 든 처방 ${preview.rows.filter((r) => r.herbs.some((h) => h.gramsPerPacket <= 0)).length}개(그램은 처방전에서 직접 채워요)`}
                {preview.rows.some((r) => r.danglingNames.length > 0) && ` · 그램이 안 붙은 약재가 있는 처방 ${preview.rows.filter((r) => r.danglingNames.length > 0).length}개(그 약재는 빠져요)`}
                {preview.skipped.length > 0 && ` · 읽지 못한 줄 ${preview.skipped.length}개(${preview.skipped.slice(0, 5).map((s) => `${s.line}번`).join(', ')}${preview.skipped.length > 5 ? ' …' : ''})`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
