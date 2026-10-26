'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { confirmDialog } from '@/lib/confirmDialog';
import { DOCUMENT_CATEGORIES, defaultTitle, filterDocuments, formatFileSize, MAX_DOCUMENT_BYTES } from '@/lib/clinicDocuments';
import { createClient } from '@/lib/supabase/client';
import { currentStaff } from '@/lib/supabase/herbQueue';
import { deleteDocument, documentUrl, listDocuments, uploadDocument, type ClinicDocument } from '@/lib/supabase/clinicDocuments';

const smallButton = { fontSize: 12, padding: '3px 10px', whiteSpace: 'nowrap' as const };

function koDay(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${kst.getUTCFullYear()}.${kst.getUTCMonth() + 1}.${kst.getUTCDate()}`;
}

// 자료실 — 복용법·접수증 같은 문서를 올리고 열어 보고 내려받는다.
export function DocumentLibrary() {
  const supabase = useMemo(() => createClient(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<ClinicDocument[]>([]);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0]);

  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const me = await currentStaff(supabase);
      setStaffId(me.id);
      setDocs(await listDocuments(supabase));
      setError('');
    } catch {
      setError('자료를 불러오지 못했어요. (자료실 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  function pickFile(f: File | null) {
    setFile(f);
    if (f) setTitle(defaultTitle(f.name));
  }

  async function upload() {
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError('파일이 너무 커요. 50MB 이하만 올릴 수 있어요.');
      return;
    }
    setBusy(true);
    try {
      const doc = await uploadDocument(supabase, { file, title: title.trim() || defaultTitle(file.name), category, uploadedBy: staffId });
      setDocs((prev) => [doc, ...prev]);
      setFile(null);
      setTitle('');
      if (fileInput.current) fileInput.current.value = '';
      setError('');
    } catch {
      setError('올리지 못했어요. 잠시 뒤 다시 해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function open(doc: ClinicDocument, download: boolean) {
    // 팝업 차단을 피하려고 창을 먼저 열고, 주소가 오면 그곳으로 보낸다.
    const tab = download ? null : window.open('', '_blank');
    try {
      const url = await documentUrl(supabase, doc, download);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch {
      tab?.close();
      setError('파일을 열지 못했어요.');
    }
  }

  async function remove(doc: ClinicDocument) {
    if (!(await confirmDialog(`"${doc.title}" 자료를 삭제할까요? 되돌릴 수 없어요.`, { confirmLabel: '삭제' }))) return;
    try {
      await deleteDocument(supabase, doc);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch {
      setError('삭제하지 못했어요.');
    }
  }

  const shown = useMemo(() => filterDocuments(docs, filterCategory, query), [docs, filterCategory, query]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) m.set(d.category, (m.get(d.category) ?? 0) + 1);
    return m;
  }, [docs]);

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>자료실</h1>
      <p className="muted-text" style={{ margin: '0 0 14px', fontSize: 13 }}>복용법·접수증 같은 한의원 문서를 올려 두는 곳이에요. 모든 직원이 열어 보고 내려받을 수 있어요(파일 하나 50MB까지).</p>

      <div className="card" style={{ padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input ref={fileInput} type="file" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} style={{ fontSize: 13 }} />
        <input className="input-field" placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} style={{ fontSize: 13, minWidth: 200 }} />
        <select className="input-field" value={category} onChange={(e) => setCategory(e.target.value)} style={{ fontSize: 13 }}>
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button type="button" className="btn-primary" disabled={!file || busy} onClick={upload} style={{ fontSize: 13, padding: '4px 14px' }}>
          {busy ? '올리는 중…' : '올리기'}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <button type="button" className={filterCategory == null ? 'btn-primary' : undefined} onClick={() => setFilterCategory(null)} style={smallButton}>
          전체 {docs.length}
        </button>
        {DOCUMENT_CATEGORIES.map((c) => (
          <button key={c} type="button" className={filterCategory === c ? 'btn-primary' : undefined} onClick={() => setFilterCategory(c)} style={smallButton}>
            {c} {counts.get(c) ?? 0}
          </button>
        ))}
        <input className="input-field" placeholder="제목·파일 이름 검색" value={query} onChange={(e) => setQuery(e.target.value)} style={{ fontSize: 13, marginLeft: 'auto', minWidth: 180 }} />
      </div>

      {loading && <p className="muted-text">불러오는 중…</p>}
      {!loading && !error && shown.length === 0 && <p className="muted-text">{docs.length === 0 ? '아직 올린 자료가 없어요. 위에서 파일을 골라 올려 주세요.' : '조건에 맞는 자료가 없어요.'}</p>}
      {shown.map((d) => (
        <div key={d.id} className="card" style={{ padding: '8px 12px', marginBottom: 6, display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{d.title}</span>
              <span style={{ fontSize: 11, background: 'var(--color-surface-2)', borderRadius: 6, padding: '1px 6px' }}>{d.category}</span>
            </div>
            <div className="muted-text" style={{ fontSize: 12 }}>
              {d.fileName}
              {d.sizeBytes != null ? ` · ${formatFileSize(d.sizeBytes)}` : ''} · {koDay(d.createdAt)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="btn-primary" onClick={() => open(d, false)} style={smallButton}>열기</button>
            <button type="button" onClick={() => open(d, true)} style={smallButton}>내려받기</button>
            <button type="button" onClick={() => remove(d)} style={smallButton}>삭제</button>
          </div>
        </div>
      ))}
    </div>
  );
}
