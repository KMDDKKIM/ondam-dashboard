'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FirstVisitCandidateDto, FirstVisitCandidatesResult, VisitClassification } from '@/lib/firstVisit';
import { candidateSuggestion, reconcileFirstVisits, matchRegisteredCandidates } from '@/lib/firstVisitReconcile';
import { todayKst } from '@/lib/kst';
import type { HappyCallPatient, Staff } from '@/lib/types';

type PatientType = HappyCallPatient['patientType'];
const PATIENT_TYPES: PatientType[] = ['건보', '자보', '비급여'];

export interface CandidateRegistration {
  candidate: FirstVisitCandidateDto;
  visitKind: '초진' | '재초진';
  doctorStaffId: string;
  patientType: PatientType;
}

interface Props {
  date: string;
  onDateChange: (date: string) => void;
  staffList: Staff[];
  /** 그 날짜(초진일)에 이미 등록된 환자 */
  registered: HappyCallPatient[];
  onRegister: (registration: CandidateRegistration) => Promise<void>;
}

// 예약 명단의 주치의 이름(예: "김원장")과 직원 이름을 맞춰 본다. 못 찾으면 직원이 직접 고른다.
function matchStaffId(doctorName: string, staffList: Staff[]): string {
  const name = doctorName.trim();
  if (!name) return '';
  const exact = staffList.find((s) => s.name === name);
  if (exact) return exact.id;
  const partial = staffList.filter((s) => name.includes(s.name) || s.name.includes(name));
  return partial.length === 1 ? partial[0].id : '';
}

const cell = { border: '1px solid #ddd', padding: '4px 6px', fontSize: 13 } as const;

export function FirstVisitCandidates({ date, onDateChange, staffList, registered, onRegister }: Props) {
  const [data, setData] = useState<FirstVisitCandidatesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRevisits, setShowRevisits] = useState(false);
  const [doctorPick, setDoctorPick] = useState<Record<string, string>>({});
  const [typePick, setTypePick] = useState<Record<string, PatientType>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const today = todayKst();
  const requestId = useRef(0);

  // 날짜를 빠르게 바꿀 때 늦게 도착한 이전 날짜의 응답이 화면을 덮어쓰지 않도록 마지막 요청만 반영한다.
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/first-visit-candidates?date=${encodeURIComponent(date)}`);
      if (!response.ok) throw new Error('failed');
      const json = (await response.json()) as FirstVisitCandidatesResult;
      if (id !== requestId.current) return;
      setData(json);
    } catch {
      if (id !== requestId.current) return;
      setData(null);
      setError('후보를 불러오지 못했어요.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    // 등록 여부는 홈/메뉴 배지와 같은 함수로 정한다(등록 환자 한 명은 후보 한 명에게만 짝지어진다).
    const match = matchRegisteredCandidates(
      data?.candidates ?? [],
      registered.map((p) => ({ patientName: p.patientName, chartNo: p.chartNo, phone: p.phone }))
    );
    return (data?.candidates ?? []).map((rawCandidate) => {
      // 이름이 같은 등록 환자가 있지만 같은 사람인지 확인할 수 없는 접수 후보는 "동명이인 가능"으로 보여 준다.
      const candidate = match.possibleHomonym.has(rawCandidate) ? { ...rawCandidate, possibleHomonym: true } : rawCandidate;
      // 일일결산 기반이면 서버가 이전 내원 기록·차트번호로 정한 판정을 쓰고, 예약 명단 기반이면 이전 내원일로 판정한다.
      const suggestion: VisitClassification = candidateSuggestion(candidate, date);
      const key = candidate.fromReception
        ? `reception|${candidate.receptionId ?? candidate.patientName}`
        : `${candidate.chartNo}|${candidate.patientName}|${candidate.phone}`;
      return { candidate, suggestion, isRegistered: match.registered.has(rawCandidate), key };
    });
  }, [data, date, registered]);

  // 초진/재초진으로 추정된 사람 + "동명이인 가능"이라 재진으로 단정할 수 없는 사람은 목록에 남긴다.
  const listRows = rows.filter((r) => r.suggestion !== '재진' || r.candidate.possibleHomonym);
  const pending = listRows.filter((r) => !r.isRegistered);
  const revisitRows = rows.filter((r) => r.suggestion === '재진' && !r.candidate.possibleHomonym);

  // 대조 규칙은 홈/메뉴 배지와 같은 함수(firstVisitReconcile.ts)를 쓴다.
  const { expected, expectedSource, registered: registeredCount, missing, receptionMore } = data
    ? reconcileFirstVisits(data, registered.length, date)
    : { expected: 0, expectedSource: '', registered: registered.length, missing: 0, receptionMore: 0 };
  const label = date === today ? '오늘' : date;

  async function register(row: (typeof rows)[number], visitKind: '초진' | '재초진') {
    const doctorStaffId = doctorPick[row.key] ?? matchStaffId(row.candidate.doctorName, staffList);
    if (!doctorStaffId) {
      setError('진료의를 먼저 골라 주세요.');
      return;
    }
    setBusyKey(row.key);
    setError('');
    try {
      await onRegister({ candidate: row.candidate, visitKind, doctorStaffId, patientType: typePick[row.key] ?? '건보' });
    } catch {
      setError('등록에 실패했어요.');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <strong>
          {data?.source === 'settlement'
            ? '그날 내원 환자 중 초진·재초진 후보'
            : data?.source === 'reception'
              ? '접수기록부의 초진·재초진 후보'
              : '예약 명단의 초진·재초진 후보'}
        </strong>
        <input type="date" value={date} onChange={(e) => e.target.value && onDateChange(e.target.value)} style={{ fontSize: 12, padding: 3 }} />
        <button type="button" onClick={load} style={{ fontSize: 12, padding: '3px 10px' }}>
          새로고침
        </button>
      </div>
      <p className="muted-text" style={{ fontSize: 12, margin: '0 0 8px' }}>
        {data?.source === 'settlement'
          ? '일일결산에 저장된 그날 실제 내원 환자에서 뽑았어요. 가져온 내원 이력·이전 결산 기록·차트번호로 판단해요(이력이 없는 기간의 내원은 알 수 없어요).'
          : data?.source === 'reception'
            ? '접수기록부에 초)·재초)로 적힌 환자예요. 차트번호·연락처는 접수기록부에 없어서 이름만 등록돼요.'
            : '대시보드에 저장된 예약 기록만으로 판단해서 "초진(추정)"은 실제와 다를 수 있어요. 등록 전에 꼭 확인해 주세요.'}
        {' '}접수기록부에 초)·재초)로 적힌 환자도 함께 보여요(같은 사람은 한 번만). 재초진은 마지막 내원 후 3개월 이상 지나 다시 온 환자예요.
      </p>

      {error && <p style={{ color: 'red', fontSize: 13, margin: '0 0 8px' }}>{error}</p>}
      {data?.receptionUnavailable && (
        <p className="muted-text" style={{ fontSize: 12, margin: '0 0 8px' }}>
          접수기록부를 읽지 못했어요 — 접수기록부에서 온 후보는 빠져 있어요. 새로고침해 보세요.
        </p>
      )}

      {loading ? (
        <p className="muted-text">불러오는 중...</p>
      ) : data && !data.hasRecord ? (
        <p className="muted-text">{date} 일일결산(환자 목록)이나 예약 명단이 아직 저장되어 있지 않아요.</p>
      ) : data ? (
        <>
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              marginBottom: 10,
              fontSize: 14,
              fontWeight: 700,
              color: missing > 0 ? '#b3261e' : '#1b7a3a',
              background: missing > 0 ? '#fdecea' : '#e8f5ec',
            }}
          >
            {label} 초진/재초진 {expected}명 중 {registeredCount}명 등록 — {missing > 0 ? `${missing}명 누락` : '누락 없음'}
            <span style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>({expectedSource})</span>
          </div>
          {receptionMore > 0 && (
            <p className="muted-text" style={{ fontSize: 12, margin: '-4px 0 10px' }}>
              접수기록부 기준으로 {receptionMore}명 더 있어요
            </p>
          )}

          {pending.length === 0 ? (
            <p className="muted-text" style={{ margin: 0 }}>
              아직 등록하지 않은 초진/재초진 후보가 없어요.
            </p>
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ background: '#f0f0f0' }}>
                  {['성함', '차트번호', '연락처', data?.source === 'settlement' ? '결산 진료의' : '예약 주치의', ...(data?.source === 'settlement' ? [] : ['시간']), '판정', '진료의', '구분', ''].map((h) => (
                    <th key={h} style={{ ...cell, textAlign: 'left' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => {
                  const kind: '초진' | '재초진' = row.suggestion === '재초진' ? '재초진' : '초진';
                  const doctorId = doctorPick[row.key] ?? matchStaffId(row.candidate.doctorName, staffList);
                  return (
                    <tr key={row.key}>
                      <td style={cell}>{row.candidate.patientName}</td>
                      <td style={cell}>{row.candidate.chartNo || '-'}</td>
                      <td style={cell}>{row.candidate.phone || '-'}</td>
                      <td style={cell}>{row.candidate.doctorName || '-'}</td>
                      {data?.source !== 'settlement' && <td style={cell}>{row.candidate.timeLabel || '-'}</td>}
                      <td style={cell}>
                        {row.suggestion}
                        {row.candidate.kindReason && (
                          <span className="muted-text" style={{ fontSize: 11, marginLeft: 6 }}>
                            · {row.candidate.kindReason}
                          </span>
                        )}
                        {row.candidate.likelyNewChart && (
                          <span
                            style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: '#e8f5ec', color: '#1b7a3a', fontSize: 11, fontWeight: 700 }}
                            title="결산표의 신규환자수만큼, 그날 차트번호가 가장 큰 사람이에요"
                          >
                            새 차트
                          </span>
                        )}
                        {row.candidate.possibleHomonym && (
                          <span
                            style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: '#fff3cd', color: '#7a5b00', fontSize: 11, fontWeight: 700 }}
                          >
                            동명이인 가능 · 확인 필요
                          </span>
                        )}
                        {row.candidate.previousVisitDates.length > 0 && (
                          <span className="muted-text" style={{ fontSize: 11 }}>
                            {' '}
                            (마지막 내원 {row.candidate.previousVisitDates[row.candidate.previousVisitDates.length - 1]})
                          </span>
                        )}
                      </td>
                      <td style={cell}>
                        <select
                          value={doctorId}
                          onChange={(e) => setDoctorPick((prev) => ({ ...prev, [row.key]: e.target.value }))}
                          style={{ fontSize: 13, padding: 2 }}
                        >
                          <option value="">진료의</option>
                          {staffList.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={cell}>
                        <select
                          value={typePick[row.key] ?? '건보'}
                          onChange={(e) => setTypePick((prev) => ({ ...prev, [row.key]: e.target.value as PatientType }))}
                          style={{ fontSize: 13, padding: 2 }}
                        >
                          {PATIENT_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={cell}>
                        <button
                          type="button"
                          disabled={busyKey === row.key || !doctorId}
                          title={doctorId ? undefined : '진료의를 먼저 골라 주세요'}
                          onClick={() => register(row, kind)}
                          style={{ fontSize: 13, padding: '3px 10px', fontWeight: 700 }}
                        >
                          {kind} 등록
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {listRows.length > pending.length && (
            <p className="muted-text" style={{ fontSize: 12, margin: '8px 0 0' }}>
              이미 등록된 후보 {listRows.length - pending.length}명은 위 목록에서 뺐어요.
            </p>
          )}

          {revisitRows.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button type="button" onClick={() => setShowRevisits((v) => !v)} style={{ fontSize: 12, padding: '2px 8px' }}>
                {showRevisits ? '재진 숨기기' : `재진 ${revisitRows.length}명 보기 (등록 불필요)`}
              </button>
              {showRevisits && (
                <p className="muted-text" style={{ fontSize: 12, margin: '6px 0 0' }}>
                  {revisitRows.map((r) => r.candidate.patientName).join(', ')}
                </p>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
