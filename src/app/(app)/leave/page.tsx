'use client';

import { confirmDialog } from '@/lib/confirmDialog';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addDaysKst, currentMonthKst, todayKst } from '@/lib/kst';
import { computeBalances, defaultLeaveKind, grantedKinds, leaveDaysUsed, monthGridWeeks, yearOfDate, type LeaveBalance, type LeaveKind } from '@/lib/leave';
import {
  cancelLeaveRequest,
  createAdjustment,
  createLeaveRequest,
  decideLeaveRequest,
  deleteAdjustment,
  listAdjustments,
  listLeaveRequests,
  updateLeaveRequest,
  type LeaveAdjustment,
  type LeaveRequest,
  type LeaveRequestEdit,
} from '@/lib/supabase/leave';
import { MonthCalendar, type CalendarEntry } from '@/components/leave/MonthCalendar';
import { LeaveRequestList } from '@/components/leave/LeaveRequestList';

interface Me {
  id: string;
  name: string;
  isOwner: boolean;
}

interface StaffOption {
  id: string;
  name: string;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function buildEntriesByDate(requests: LeaveRequest[], from: string, to: string): Map<string, CalendarEntry[]> {
  const map = new Map<string, CalendarEntry[]>();
  for (const r of requests) {
    if (r.status === 'rejected') continue;
    let d = r.startDate < from ? from : r.startDate;
    const end = r.endDate > to ? to : r.endDate;
    while (d <= end) {
      const list = map.get(d) ?? [];
      list.push({ id: r.id, staffName: r.staffName, kind: r.kind, halfDay: r.halfDay, status: r.status as 'pending' | 'approved' });
      map.set(d, list);
      d = addDaysKst(d, 1);
    }
  }
  return map;
}

const kindLabel: Record<LeaveKind, string> = { monthly: '월차', annual: '연차' };

// 부여·사용·남은 일수를 한눈에 — 남은 일수를 가장 크게.
function BalanceTile({ label, balance }: { label: string; balance: LeaveBalance }) {
  const cell = (name: string, value: number, strong = false) => (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <p className="muted-text" style={{ fontSize: 11, marginBottom: 2 }}>{name}</p>
      <p style={{ fontSize: strong ? 24 : 18, fontWeight: 700, margin: 0, color: strong && value < 0 ? 'var(--color-error)' : undefined }}>{value}</p>
    </div>
  );
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{label}</p>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
        {cell('부여', balance.entitled)}
        {cell('사용', balance.used)}
        {cell('남음', balance.available, true)}
      </div>
    </div>
  );
}

export default function LeavePage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  const [month, setMonth] = useState(currentMonthKst());

  const [calendarRequests, setCalendarRequests] = useState<LeaveRequest[]>([]);
  const [myApprovedRequests, setMyApprovedRequests] = useState<LeaveRequest[]>([]);
  const [myPendingRequests, setMyPendingRequests] = useState<LeaveRequest[]>([]);
  const [myAdjustments, setMyAdjustments] = useState<LeaveAdjustment[]>([]);

  const [ownerPendingRequests, setOwnerPendingRequests] = useState<LeaveRequest[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [staffAdjustments, setStaffAdjustments] = useState<LeaveAdjustment[]>([]);
  const [staffApprovedRequests, setStaffApprovedRequests] = useState<LeaveRequest[]>([]);

  // 신청 폼
  const today = todayKst();
  const currentYear = yearOfDate(today);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [halfDay, setHalfDay] = useState<'am' | 'pm' | null>(null);
  const [kind, setKind] = useState<LeaveKind>('monthly');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 원장 전용 조정 폼
  const [adjStaffId, setAdjStaffId] = useState('');
  const [adjKind, setAdjKind] = useState<LeaveKind>('monthly');
  const [adjDays, setAdjDays] = useState('');
  const [adjYear, setAdjYear] = useState(currentYear);
  const [adjReason, setAdjReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [savingAdj, setSavingAdj] = useState(false);

  // 원장 전용 "직원별 연차·월차 부여" 표의 기준 연도 — 연차는 연도별로 끊어서 계산되므로.
  const [viewYear, setViewYear] = useState(currentYear);

  const loadMe = useCallback(async (): Promise<Me | null> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('staff').select('id, name, role').eq('id', user.id).maybeSingle();
    if (!data) return null;
    return {
      id: data.id as string,
      name: data.name as string,
      isOwner: data.role === 'owner',
    };
  }, [supabase]);

  const refreshCalendar = useCallback(
    async (forMonth: string) => {
      const weeks = monthGridWeeks(forMonth);
      const from = weeks[0][0];
      const to = weeks[weeks.length - 1][6];
      const requests = await listLeaveRequests(supabase, { range: { from, to } });
      setCalendarRequests(requests);
    },
    [supabase]
  );

  const refreshMine = useCallback(
    async (staffId: string) => {
      const [approved, pending, adjustments] = await Promise.all([
        listLeaveRequests(supabase, { staffId, status: 'approved' }),
        listLeaveRequests(supabase, { staffId, status: 'pending' }),
        listAdjustments(supabase, staffId),
      ]);
      setMyApprovedRequests(approved);
      setMyPendingRequests(pending);
      setMyAdjustments(adjustments);
    },
    [supabase]
  );

  const refreshOwnerQueue = useCallback(async () => {
    const pending = await listLeaveRequests(supabase, { status: 'pending' });
    setOwnerPendingRequests(pending);
  }, [supabase]);

  const refreshStaffPanel = useCallback(async () => {
    const { data } = await supabase
      .from('staff')
      .select('id, name')
      .eq('status', 'approved')
      .order('name');
    setStaffList((data ?? []) as { id: string; name: string }[]);
    const [adjustments, approvedRequests] = await Promise.all([
      listAdjustments(supabase),
      listLeaveRequests(supabase, { status: 'approved' }),
    ]);
    setStaffAdjustments(adjustments);
    setStaffApprovedRequests(approvedRequests);
  }, [supabase]);

  useEffect(() => {
    setLoading(true);
    setError('');
    loadMe()
      .then(async (meData) => {
        setMe(meData);
        if (!meData) return;
        await Promise.all([
          refreshMine(meData.id),
          meData.isOwner ? refreshOwnerQueue() : Promise.resolve(),
          meData.isOwner ? refreshStaffPanel() : Promise.resolve(),
        ]);
      })
      .catch(() => setError('불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [loadMe, refreshMine, refreshOwnerQueue, refreshStaffPanel]);

  useEffect(() => {
    refreshCalendar(month).catch(() => setError('달력을 불러오지 못했습니다.'));
  }, [month, refreshCalendar]);

  // 다른 사람이 신청·승인한 내용이 화면을 새로 열지 않아도 보이게, 30초마다 + 탭으로 돌아올 때 다시 읽는다.
  useEffect(() => {
    if (!me) return;
    const reload = () => {
      if (document.visibilityState !== 'visible') return;
      Promise.all([
        refreshCalendar(month),
        refreshMine(me.id),
        me.isOwner ? refreshOwnerQueue() : Promise.resolve(),
        me.isOwner ? refreshStaffPanel() : Promise.resolve(),
      ]).catch(() => {});
    };
    const timer = window.setInterval(reload, 30000);
    document.addEventListener('visibilitychange', reload);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', reload);
    };
  }, [me, month, refreshCalendar, refreshMine, refreshOwnerQueue, refreshStaffPanel]);

  async function refreshAfterMutation() {
    if (!me) return;
    await Promise.all([
      refreshCalendar(month),
      refreshMine(me.id),
      me.isOwner ? refreshOwnerQueue() : Promise.resolve(),
      me.isOwner ? refreshStaffPanel() : Promise.resolve(),
    ]);
  }

  const weeks = useMemo(() => monthGridWeeks(month), [month]);
  const entriesByDate = useMemo(
    () => buildEntriesByDate(calendarRequests, weeks[0][0], weeks[weeks.length - 1][6]),
    [calendarRequests, weeks]
  );

  const balances = useMemo(
    () =>
      me
        ? computeBalances(
            currentYear,
            myAdjustments.map((a) => ({ kind: a.kind, days: a.days, year: a.year })),
            myApprovedRequests.map((r) => ({
              kind: r.kind,
              days: leaveDaysUsed(r.startDate, r.endDate, r.halfDay),
              year: yearOfDate(r.startDate),
            }))
          )
        : null,
    [me, currentYear, myAdjustments, myApprovedRequests]
  );

  // 원장이 부여해 준 종류만 신청할 수 있다 — 지금 고른 종류가 부여된 게 아니면 부여된 쪽으로 맞춘다.
  const allowedKinds = useMemo(() => (balances ? grantedKinds(balances) : []), [balances]);
  useEffect(() => {
    if (!balances || allowedKinds.length === 0 || allowedKinds.includes(kind)) return;
    const next = defaultLeaveKind(allowedKinds, balances);
    if (next) setKind(next);
  }, [balances, allowedKinds, kind]);

  useEffect(() => {
    if (startDate !== endDate && halfDay) setHalfDay(null);
  }, [startDate, endDate, halfDay]);

  const staffBalances = useMemo(() => {
    const map = new Map<string, { monthly: LeaveBalance; annual: LeaveBalance }>();
    for (const s of staffList) {
      const adj = staffAdjustments.filter((a) => a.staffId === s.id).map((a) => ({ kind: a.kind, days: a.days, year: a.year }));
      const used = staffApprovedRequests
        .filter((r) => r.staffId === s.id)
        .map((r) => ({ kind: r.kind, days: leaveDaysUsed(r.startDate, r.endDate, r.halfDay), year: yearOfDate(r.startDate) }));
      map.set(s.id, computeBalances(viewYear, adj, used));
    }
    return map;
  }, [staffList, staffAdjustments, staffApprovedRequests, viewYear]);

  // 앞으로 예정(끝나는 날이 오늘 이후)인 내 신청 — 대기 + 확정. 지난 건은 변경·취소 대상이 아니다.
  const myActiveRequests = useMemo(
    () =>
      [...myPendingRequests, ...myApprovedRequests]
        .filter((r) => r.endDate >= today)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [myPendingRequests, myApprovedRequests, today]
  );
  const upcomingApproved = useMemo(
    () => staffApprovedRequests.filter((r) => r.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [staffApprovedRequests, today]
  );

  const staffNameById = useMemo(() => new Map(staffList.map((s) => [s.id, s.name])), [staffList]);

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    if (startDate > endDate) {
      setError('종료일이 시작일보다 빨라요.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await createLeaveRequest(supabase, {
        staffId: me.id,
        startDate,
        endDate,
        halfDay: startDate === endDate ? halfDay : null,
        kind,
        memo,
        requestedBy: me.id,
      });
      setMemo('');
      setHalfDay(null);
      await refreshAfterMutation();
    } catch {
      setError('신청하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  function describeRequest(r: LeaveRequest): string {
    const range = r.endDate !== r.startDate ? `${r.startDate} ~ ${r.endDate}` : r.startDate;
    return `${range}${r.halfDay ? (r.halfDay === 'am' ? ' 오전반차' : ' 오후반차') : ''} ${kindLabel[r.kind]}`;
  }

  // 대기 중이든 확정이든 취소(삭제)할 수 있다 — 확정을 취소하면 잔여일수가 다시 돌아온다.
  async function handleCancelRequest(r: LeaveRequest) {
    const confirmed = r.status === 'approved';
    const message = confirmed
      ? `확정된 ${describeRequest(r)} 신청을 취소할까요? 잔여일수가 다시 돌아와요.`
      : `${describeRequest(r)} 신청을 취소할까요?`;
    if (!(await confirmDialog(message, { confirmLabel: '취소하기' }))) return;
    setError('');
    try {
      await cancelLeaveRequest(supabase, r.id);
      await refreshAfterMutation();
    } catch {
      setError('취소하지 못했습니다.');
    }
  }

  // 직원이 확정된 건을 고치면 승인 대기로 돌아가고, 원장이 고치면 그 내용으로 바로 확정된다.
  async function handleSaveRequest(r: LeaveRequest, edit: LeaveRequestEdit): Promise<boolean> {
    if (!me) return false;
    setError('');
    try {
      await updateLeaveRequest(supabase, r.id, edit, { id: me.id, isOwner: me.isOwner, currentStatus: r.status });
      await refreshAfterMutation();
      return true;
    } catch {
      setError('변경하지 못했습니다.');
      return false;
    }
  }

  async function handleDecide(id: string, status: 'approved' | 'rejected', note = '') {
    if (!me) return;
    setError('');
    try {
      await decideLeaveRequest(supabase, id, status, me.id, note);
      setRejectingId(null);
      setRejectReason('');
      await refreshAfterMutation();
    } catch {
      setError('처리하지 못했습니다.');
    }
  }

  async function handleAddAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!me || !adjStaffId) return;
    const days = Number(adjDays);
    if (!days) return;
    setSavingAdj(true);
    setError('');
    try {
      await createAdjustment(supabase, {
        staffId: adjStaffId,
        kind: adjKind,
        days,
        year: adjYear,
        reason: adjReason.trim(),
        createdBy: me.id,
      });
      setAdjDays('');
      setAdjReason('');
      await refreshStaffPanel();
    } catch {
      setError('조정을 추가하지 못했습니다.');
    } finally {
      setSavingAdj(false);
    }
  }

  async function handleDeleteAdjustment(id: string) {
    if (!(await confirmDialog('이 부여·조정 내역을 지울까요?'))) return;
    setError('');
    try {
      await deleteAdjustment(supabase, id);
      await refreshStaffPanel();
    } catch {
      setError('지우지 못했습니다.');
    }
  }

  if (loading) return <p className="muted-text">불러오는 중...</p>;
  if (!me) return <p className="muted-text">직원 정보를 찾을 수 없어요.</p>;

  const previewDays = startDate <= endDate ? leaveDaysUsed(startDate, endDate, startDate === endDate ? halfDay : null) : 0;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>🗓️ 연차 관리</h1>
      <p className="muted-text" style={{ marginBottom: 20 }}>
        연차·월차를 신청하고, 팀 전체 휴가 일정을 달력에서 확인해요.
      </p>
      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

      <div className="leave-top">
        <div className="leave-top-left">
          {me.isOwner && (
            <div className="card" style={{ padding: 14 }}>
              <h2 style={{ fontSize: 14, marginBottom: 8 }}>승인 대기 중 — 전체 ({ownerPendingRequests.length}건)</h2>
              {ownerPendingRequests.length === 0 ? (
                <p className="muted-text">대기 중인 신청이 없어요.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {ownerPendingRequests.map((r) => (
                    <li key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-line)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600 }}>{r.staffName}</span>
                        <span style={{ fontSize: 13 }}>
                          {r.startDate}
                          {r.endDate !== r.startDate ? ` ~ ${r.endDate}` : ''}
                          {r.halfDay ? (r.halfDay === 'am' ? ' 오전반차' : ' 오후반차') : ''}
                        </span>
                        <span className="muted-text" style={{ fontSize: 13 }}>{kindLabel[r.kind]}</span>
                        {r.memo && <span className="muted-text" style={{ fontSize: 13 }}>{r.memo}</span>}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                          <button type="button" onClick={() => handleDecide(r.id, 'approved')} className="btn-primary" style={{ padding: '4px 12px', fontSize: 13 }}>
                            승인
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingId(rejectingId === r.id ? null : r.id);
                              setRejectReason('');
                            }}
                            style={{ padding: '4px 12px', fontSize: 13, borderRadius: 8, border: '1px solid var(--color-error)', background: 'transparent', color: 'var(--color-error)', cursor: 'pointer' }}
                          >
                            반려
                          </button>
                        </div>
                      </div>
                      {rejectingId === r.id && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <input
                            className="input-field"
                            autoFocus
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="반려 사유 (필수) — 신청한 직원에게 보여요"
                            style={{ flex: '1 1 220px', padding: '6px 10px', fontSize: 13 }}
                          />
                          <button
                            type="button"
                            disabled={!rejectReason.trim()}
                            onClick={() => handleDecide(r.id, 'rejected', rejectReason)}
                            style={{ padding: '6px 14px', fontSize: 13, borderRadius: 8, border: 'none', background: 'var(--color-error)', color: '#fff', cursor: rejectReason.trim() ? 'pointer' : 'not-allowed', opacity: rejectReason.trim() ? 1 : 0.5 }}
                          >
                            반려하기
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {allowedKinds.length > 0 && balances ? (
            <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, padding: 16 }}>
              {allowedKinds.map((k) => (
                <BalanceTile key={k} label={k === 'annual' ? `연차 (${currentYear}년)` : '월차'} balance={balances[k]} />
              ))}
            </div>
          ) : (
            <div className="card" style={{ padding: 16 }}>
              <p className="muted-text" style={{ margin: 0, fontSize: 13 }}>
                아직 부여된 월차·연차가 없어요. 원장님이 부여해 주시면 여기에 나타나고 신청할 수 있어요.
              </p>
            </div>
          )}

          {allowedKinds.length > 0 && (
            <form onSubmit={handleSubmitRequest} className="card" style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
              <div>
                <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>시작일</label>
                <input className="input-field" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>종료일</label>
                <input className="input-field" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div>
                <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>구분</label>
                {allowedKinds.length === 1 ? (
                  <div className="input-field" style={{ width: 100, display: 'flex', alignItems: 'center', background: 'var(--color-surface-2)' }}>
                    {kindLabel[allowedKinds[0]]}
                  </div>
                ) : (
                  <select className="input-field" value={kind} onChange={(e) => setKind(e.target.value as LeaveKind)} style={{ width: 100 }}>
                    {allowedKinds.map((k) => (
                      <option key={k} value={k}>
                        {kindLabel[k]}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {startDate === endDate && (
                <div>
                  <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>반차</label>
                  <select
                    className="input-field"
                    value={halfDay ?? ''}
                    onChange={(e) => setHalfDay(e.target.value ? (e.target.value as 'am' | 'pm') : null)}
                    style={{ width: 110 }}
                  >
                    <option value="">종일</option>
                    <option value="am">오전 반차</option>
                    <option value="pm">오후 반차</option>
                  </select>
                </div>
              )}
              <div>
                <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>사유</label>
                <input className="input-field" value={memo} onChange={(e) => setMemo(e.target.value)} style={{ width: 160 }} />
              </div>
              <button type="submit" className="btn-primary" disabled={submitting || startDate > endDate} style={{ padding: '7px 16px' }}>
                {submitting ? '신청 중...' : '신청'}
              </button>
              <p className="muted-text" style={{ width: '100%', fontSize: 12, margin: 0 }}>
                {previewDays}일 차감돼요(원장 승인 전까지는 잔여일수에서 빠지지 않아요).
              </p>
            </form>
          )}
          <div className="card" style={{ padding: 14 }}>
            <h2 style={{ fontSize: 14, marginBottom: 4 }}>내 신청 ({myActiveRequests.length}건)</h2>
            <p className="muted-text" style={{ fontSize: 12, marginBottom: 10 }}>
              확정된 연차도 바꾸거나 취소할 수 있어요.{me.isOwner ? '' : ' 바꾸면 다시 승인을 받아요.'}
            </p>
            <LeaveRequestList
              requests={myActiveRequests}
              emptyText="앞으로 예정된 신청이 없어요."
              onSave={handleSaveRequest}
              onCancel={handleCancelRequest}
              editNeedsReapproval={!me.isOwner}
              allowedKinds={allowedKinds}
            />
          </div>
          {me.isOwner && (
            <div className="card" style={{ padding: 14 }}>
              <h2 style={{ fontSize: 14, marginBottom: 4 }}>확정된 일정 — 전체 ({upcomingApproved.length}건)</h2>
              <p className="muted-text" style={{ fontSize: 12, marginBottom: 10 }}>앞으로 예정된 확정 연차예요. 바꾸면 바로 확정되고 직원에게 알림이 가요.</p>
              <LeaveRequestList
                requests={upcomingApproved}
                showStaffName
                emptyText="앞으로 예정된 확정 일정이 없어요."
                onSave={handleSaveRequest}
                onCancel={handleCancelRequest}
                editNeedsReapproval={false}
              />
            </div>
          )}
        </div>

        <div className="leave-top-right">
          <MonthCalendar
            month={month}
            weeks={weeks}
            today={today}
            entriesByDate={entriesByDate}
            onPrevMonth={() => setMonth((m) => shiftMonth(m, -1))}
            onNextMonth={() => setMonth((m) => shiftMonth(m, 1))}
            compact
          />
        </div>
      </div>

      {me.isOwner && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h2 style={{ fontSize: 15, margin: 0 }}>직원별 연차·월차 부여</h2>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" onClick={() => setViewYear((y) => y - 1)} style={{ border: 'none', background: 'transparent', fontSize: 13, cursor: 'pointer', padding: '2px 4px' }} aria-label="이전 연도">◀</button>
              <span className="muted-text" style={{ fontSize: 13, fontWeight: 600 }}>{viewYear}년 연차 기준</span>
              <button type="button" onClick={() => setViewYear((y) => y + 1)} style={{ border: 'none', background: 'transparent', fontSize: 13, cursor: 'pointer', padding: '2px 4px' }} aria-label="다음 연도">▶</button>
            </div>
          </div>
          <p className="muted-text" style={{ fontSize: 12, marginBottom: 12 }}>
            입사일 자동 계산 없이, 아래 폼으로 직접 부여해요 — 월차는 보통 매달 1일씩 누적되고, 연차는 해마다 정해진 일수를 부여하면 그 해가 지날 때 미사용분이 소멸돼요(이월 없음).
          </p>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--color-muted)', fontSize: 12 }}>
                  {['이름', '월차(부여/사용/남음, 누적)', `연차(${viewYear}년 부여/사용/남음)`].map((h) => (
                    <th key={h} style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-line)', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffList.map((s) => {
                  const b = staffBalances.get(s.id);
                  return (
                    <tr key={s.id}>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-line)', fontWeight: 600 }}>{s.name}</td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-line)' }}>
                        {b ? `${b.monthly.entitled} / ${b.monthly.used} / ${b.monthly.available}` : '-'}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--color-line)' }}>
                        {b ? `${b.annual.entitled} / ${b.annual.used} / ${b.annual.available}` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form onSubmit={handleAddAdjustment} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>직원</label>
              <select className="input-field" value={adjStaffId} onChange={(e) => setAdjStaffId(e.target.value)} style={{ width: 140 }}>
                <option value="">선택</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>구분</label>
              <select className="input-field" value={adjKind} onChange={(e) => setAdjKind(e.target.value as LeaveKind)} style={{ width: 100 }}>
                <option value="monthly">월차</option>
                <option value="annual">연차</option>
              </select>
            </div>
            {adjKind === 'annual' && (
              <div>
                <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>연도</label>
                <input className="input-field" type="number" value={adjYear} onChange={(e) => setAdjYear(Number(e.target.value) || currentYear)} style={{ width: 90 }} />
              </div>
            )}
            <div>
              <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>일수(+/-)</label>
              <input className="input-field" type="number" step={0.5} value={adjDays} onChange={(e) => setAdjDays(e.target.value)} style={{ width: 90 }} />
            </div>
            <div>
              <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>사유(선택)</label>
              <input className="input-field" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="예: 10월 월차 부여, 2026년 연차 부여" style={{ width: 200 }} />
            </div>
            <button type="submit" className="btn-primary" disabled={savingAdj || !adjStaffId || !Number(adjDays)} style={{ padding: '7px 16px' }}>
              {savingAdj ? '추가 중...' : '부여·조정 추가'}
            </button>
          </form>

          {staffAdjustments.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3 className="muted-text" style={{ fontSize: 13, marginBottom: 8 }}>최근 부여·조정 내역</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {staffAdjustments.map((a) => (
                  <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--color-line)', fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{staffNameById.get(a.staffId) ?? '(삭제된 직원)'}</span>
                    <span className="muted-text">{kindLabel[a.kind]}{a.kind === 'annual' ? `(${a.year}년)` : ''}</span>
                    <span style={{ fontWeight: 600 }}>{a.days > 0 ? `+${a.days}` : a.days}일</span>
                    <span className="muted-text">{a.reason}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteAdjustment(a.id)}
                      style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--color-error)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
