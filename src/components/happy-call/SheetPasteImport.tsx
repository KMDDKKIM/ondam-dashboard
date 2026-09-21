'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createHappyCallPatient, updateHappyCallPatient, type HappyCallPatientPatch } from '@/lib/supabase/happyCallPatients';
import { classifyRows, parseSheetPaste, type ImportStatus, type ParsedSheetRow } from '@/lib/happyCallSheetImport';
import { todayKst } from '@/lib/kst';
import type { HappyCallPatient, Staff } from '@/lib/types';

interface Props {
  patients: HappyCallPatient[];
  staffList: Staff[];
  onDone: () => Promise<void> | void;
}

interface Analyzed {
  row: ParsedSheetRow;
  doctorId: string | null;
  errors: string[];
  status: ImportStatus;
}

const STATUS_LABEL: Record<ImportStatus, string> = {
  ready: '등록 예정',
  exists: '이미 등록됨',
  'duplicate-in-paste': '표 안에서 중복',
  error: '확인 필요',
};

// 구글시트에서 복사한 초진환자 해피콜 표를 붙여넣어 한 번에 등록한다. 진료의는 이름으로 직원을 찾고,
// 같은 이름+초진일이 이미 있으면 건너뛴다. 오류가 있는 줄은 이유를 보여 주고 등록하지 않는다.
export function SheetPasteImport({ patients, staffList, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failures, setFailures] = useState<string[]>([]);

  const parsed = useMemo(() => (text.trim() ? parseSheetPaste(text, todayKst()) : null), [text]);

  const analyzed: Analyzed[] = useMemo(() => {
    if (!parsed) return [];
    const statuses = classifyRows(
      parsed.rows,
      patients.map((p) => ({ patientName: p.patientName, firstVisitDate: p.firstVisitDate }))
    );
    return parsed.rows.map((row, i) => {
      const staff = row.doctorName ? staffList.find((s) => s.name === row.doctorName) : undefined;
      const errors = [...row.errors];
      if (row.doctorName && !staff) errors.push(`진료의 "${row.doctorName}"을(를) 직원 목록에서 찾지 못했어요`);
      const status: ImportStatus = errors.length > 0 ? 'error' : statuses[i];
      return { row, doctorId: staff?.id ?? null, errors, status };
    });
  }, [parsed, patients, staffList]);

  const readyRows = analyzed.filter((a) => a.status === 'ready');
  const count = (s: ImportStatus) => analyzed.filter((a) => a.status === s).length;

  async function handleRegister() {
    if (readyRows.length === 0) return;
    setBusy(true);
    setMessage('');
    setFailures([]);
    const failed: string[] = [];
    let done = 0;
    try {
      const {
        data: { user },
      } = await createClient().auth.getUser();
      const supabase = createClient();
      for (const { row, doctorId } of readyRows) {
        try {
          const created = await createHappyCallPatient(supabase, {
            patientName: row.patientName,
            doctorStaffId: doctorId,
            patientType: row.patientType!,
            firstVisitDate: row.firstVisitDate!,
            createdBy: user?.id ?? null,
            visitKind: row.visitKind,
            chartNo: row.chartNo,
            phone: row.phone,
          });
          const patch: HappyCallPatientPatch = {};
          if (row.acupuncture) patch.acupunctureSuccess = row.acupuncture;
          if (row.nextVisitNote) patch.nextVisitNote = row.nextVisitNote;
          if (row.callLog) patch.callLog = row.callLog;
          if (row.revisit1) patch.revisit1 = row.revisit1;
          if (row.revisit2) patch.revisit2 = row.revisit2;
          if (row.revisit3) patch.revisit3 = row.revisit3;
          if (row.jaboHerb1) patch.jaboHerb1 = row.jaboHerb1;
          if (row.jaboHerb2) patch.jaboHerb2 = row.jaboHerb2;
          if (row.jaboHerb3) patch.jaboHerb3 = row.jaboHerb3;
          if (row.memo) patch.memo = row.memo;
          if (Object.keys(patch).length > 0) await updateHappyCallPatient(supabase, created.id, patch);
          done += 1;
        } catch {
          failed.push(`${row.rowNumber}번째 줄 ${row.patientName}`);
        }
      }
    } finally {
      setBusy(false);
    }
    setFailures(failed);
    const skipped = analyzed.length - readyRows.length;
    setMessage(`${done}건을 등록했어요.${skipped > 0 ? ` (건너뜀 ${skipped}건)` : ''}`);
    if (failed.length === 0) setText('');
    await onDone();
  }

  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ border: 'none', background: 'transparent', color: 'var(--color-ink)', fontWeight: 700, fontSize: 14, padding: 0 }}
      >
        📋 구글시트에서 붙여넣기 {open ? '▲' : '▼'}
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <p className="muted-text" style={{ marginBottom: 8, fontSize: 12 }}>
            구글시트에서 행을 드래그해 복사(Ctrl+C)한 뒤 아래에 붙여넣으세요. 머리글(성함, 진료의, 구분, 초진일 …)까지 함께 복사하면 열 순서가
            달라도 돼요. 머리글 없이 붙여넣으면 성함, 진료의, 구분, 약침/패키지구분, 다음내원메모, 통화내역, 초진일, 재내원1~3, 자보약1~3, 메모
            순서로 봐요.
          </p>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setMessage('');
              setFailures([]);
            }}
            placeholder="구글시트에서 복사한 내용을 붙여넣으세요 (Ctrl+V)"
            className="input-field"
            style={{ minHeight: 70, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
          />

          {parsed && parsed.ignoredHeaders.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--color-orange)', marginTop: 6 }}>
              알아보지 못해 무시한 칸: {parsed.ignoredHeaders.join(', ')}
            </p>
          )}

          {analyzed.length > 0 && (
            <>
              <p style={{ fontSize: 13, marginTop: 10, fontWeight: 600 }}>
                {analyzed.length}줄 중 등록 예정 {count('ready')}건
                {count('exists') > 0 ? ` · 이미 등록됨 ${count('exists')}건` : ''}
                {count('duplicate-in-paste') > 0 ? ` · 표 안 중복 ${count('duplicate-in-paste')}건` : ''}
                {count('error') > 0 ? ` · 확인 필요 ${count('error')}건` : ''}
              </p>
              <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto', marginTop: 6, border: '1px solid var(--color-line)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--color-muted)', position: 'sticky', top: 0, background: 'var(--color-surface)' }}>
                      {['줄', '성함', '진료의', '구분', '초진일', '재내원', '메모', '상태'].map((h) => (
                        <th key={h} style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analyzed.map(({ row, errors, status }) => (
                      <tr key={row.rowNumber} style={{ opacity: status === 'ready' ? 1 : 0.75 }}>
                        <td style={{ padding: '5px 8px' }}>{row.rowNumber}</td>
                        <td style={{ padding: '5px 8px', fontWeight: 600 }}>{row.patientName || '-'}</td>
                        <td style={{ padding: '5px 8px' }}>{row.doctorName || '-'}</td>
                        <td style={{ padding: '5px 8px' }}>{row.patientType ?? '-'}</td>
                        <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{row.firstVisitDate ?? '-'}</td>
                        <td style={{ padding: '5px 8px' }}>{[row.revisit1, row.revisit2, row.revisit3].filter(Boolean).length}회</td>
                        <td style={{ padding: '5px 8px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.memo ?? ''}</td>
                        <td style={{ padding: '5px 8px', color: status === 'ready' ? 'var(--color-green)' : status === 'error' ? 'var(--color-error)' : 'var(--color-muted)', fontWeight: 600 }}>
                          {STATUS_LABEL[status]}
                          {errors.length > 0 && <div style={{ fontWeight: 400, fontSize: 11 }}>{errors.join(' / ')}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleRegister}
                  disabled={busy || readyRows.length === 0}
                  className="btn-primary"
                  style={{ padding: '8px 18px', fontSize: 13 }}
                >
                  {busy ? '등록 중...' : `${readyRows.length}건 등록`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setText('');
                    setMessage('');
                    setFailures([]);
                  }}
                  style={{ padding: '8px 18px', fontSize: 13, borderRadius: 10, border: '1px solid var(--color-line)', background: 'var(--color-surface)', color: 'var(--color-error)', fontWeight: 600 }}
                >
                  모두 삭제
                </button>
              </div>
            </>
          )}

          {message && <p style={{ color: 'var(--color-teal-deep)', fontSize: 13, marginTop: 8 }}>{message}</p>}
          {failures.length > 0 && (
            <p className="error-text" style={{ marginTop: 6 }}>
              등록하지 못한 줄: {failures.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
