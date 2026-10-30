'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { confirmDialog } from '@/lib/confirmDialog';
import { addDaysKst, todayKst } from '@/lib/kst';
import {
  DEFAULT_RULES,
  MAX_DETOX_CALL_DAYS,
  MAX_PILL_DAILY_DAYS,
  MAX_WEEKLY_WEEKS,
  WEEKDAYS,
  dietSchedulePreview,
  normalizeRules,
  rulesEqual,
  specialCallDates,
  specialSingleCallDate,
  type CallTiming,
  type HappyCallRules,
  type TimedCallRules,
  type TimingMode,
  type Weekday,
} from '@/lib/happyCallRules';
import { prescriptionCalls } from '@/lib/herbCallSchedule';
import { loadRulesState, saveRules, type RulesState } from '@/lib/supabase/happyCallRules';
import { applyRulesToOpenCalls, type ApplyResult } from '@/lib/supabase/happyCallRulesApply';
import { listStaffNames } from '@/lib/supabase/happyCallWorklist';
import { smallBtn } from './shared';

const MODE_LABEL: Record<TimingMode, string> = {
  'after-pickup': '수령일로부터 며칠 뒤',
  'before-end': '약이 끝나기 며칠 전',
  auto: '처방 기간에 맞춰 자동',
};

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const mdList = (dates: (string | null)[]) => dates.filter((d): d is string => Boolean(d)).map(md).join(' · ') || '없음';

// 해피콜 규칙 화면 — 한약·특수한약·린다이어트의 해피콜을 언제 거는지 정한다. 원장만 바꾸고 직원은 본다(원장 요청, 2026-10-30).
export function CallRulesEditor() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<RulesState | null>(null);
  const [draft, setDraft] = useState<HappyCallRules>(DEFAULT_RULES);
  const [isOwner, setIsOwner] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [editorName, setEditorName] = useState('');
  const [busy, setBusy] = useState<'save' | 'apply' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<ApplyResult | null>(null);

  useEffect(() => {
    (async () => {
      const [loaded, userResult] = await Promise.all([loadRulesState(supabase), supabase.auth.getUser()]);
      setState(loaded);
      setDraft(loaded.rules);
      const user = userResult.data.user;
      setUserId(user?.id ?? null);
      if (user) {
        const { data: me } = await supabase.from('staff').select('role, status').eq('id', user.id).maybeSingle();
        setIsOwner(me?.role === 'owner' && me.status === 'approved');
      }
      if (loaded.updatedBy) {
        const names = await listStaffNames(supabase).catch(() => ({}) as Record<string, string>);
        setEditorName(names[loaded.updatedBy] ?? '');
      }
    })().catch(() => setError('불러오지 못했어요. 새로고침해 주세요.'));
  }, [supabase]);

  const dirty = state ? !rulesEqual(draft, state.rules) : false;
  const disabled = !isOwner || busy !== null;

  async function persist(): Promise<boolean> {
    try {
      await saveRules(supabase, draft, userId);
      const fresh = await loadRulesState(supabase);
      if (!fresh.saved) throw new Error('not saved');
      setState(fresh);
      setDraft(fresh.rules);
      return true;
    } catch {
      setError('저장하지 못했어요. 해피콜 규칙 표를 만드는 SQL을 아직 실행하지 않았거나, 원장 계정이 아닐 수 있어요.');
      return false;
    }
  }

  async function handleSave(alsoApply: boolean) {
    setBusy('save');
    setError('');
    setMessage('');
    setApplied(null);
    try {
      if (dirty && !(await persist())) return;
      if (alsoApply) await runApply(draft);
      else setMessage(dirty ? '저장했어요. 앞으로 만드는 해피콜부터 이 규칙이 적용돼요.' : '바뀐 내용이 없어요.');
    } finally {
      setBusy(null);
    }
  }

  async function runApply(rules: HappyCallRules) {
    if (!(await confirmDialog('아직 전화하지 않은 해피콜의 날짜를 지금 규칙에 맞춰 옮길까요?\n이미 통화했거나 전화를 시도한 해피콜, 날짜가 지난 해피콜은 그대로 둬요.'))) {
      setMessage('저장만 했어요. 이미 잡힌 해피콜은 그대로예요.');
      return;
    }
    setBusy('apply');
    try {
      const result = await applyRulesToOpenCalls(supabase, rules, todayKst(), userId);
      setApplied(result);
      setState(await loadRulesState(supabase));
      setMessage('이미 잡힌 해피콜에도 적용했어요.');
    } catch {
      setError('이미 잡힌 해피콜을 다 옮기지 못했어요. 해피콜 목록을 확인하고, 다시 시도해 주세요.');
    }
  }

  // 저장된 규칙을 이미 잡힌 해피콜에 적용만 한다(규칙은 그대로).
  async function handleApplyOnly() {
    setBusy('apply');
    setError('');
    setMessage('');
    setApplied(null);
    try {
      await runApply(state?.rules ?? draft);
    } finally {
      setBusy(null);
    }
  }

  if (!state) return error ? <p className="error-text">{error}</p> : <p className="muted-text">불러오는 중...</p>;

  const set = (patch: (r: HappyCallRules) => HappyCallRules) => setDraft((r) => normalizeRules(patch(r)));
  const sampleStart = addDaysKst(todayKst(), 1);

  // ---- 예시 ----
  const herbSample = (supply: number) => mdList(prescriptionCalls({ pickupDate: sampleStart, days: supply, firstOfCourse: true }, draft.herb).map((c) => c.callDate));
  const specialSample = (() => {
    const d = specialCallDates(draft.special, sampleStart, 30);
    return mdList([d.callDate1, d.callDate2, d.callDate3]);
  })();
  const specialSingle = specialSingleCallDate(draft.special, sampleStart);
  const diet = dietSchedulePreview(draft.diet, sampleStart);

  return (
    <div>
      <p className="muted-text" style={{ marginBottom: 14 }}>
        한약·특수한약·린다이어트의 해피콜을 언제 걸지 정하는 곳이에요. 바꾸면 앞으로 만들어지는 해피콜부터 적용되고, 아래 버튼으로 이미 잡힌 해피콜(아직 전화하지 않은 것)에도 적용할 수 있어요.
        {!isOwner && <b> 규칙은 원장님만 바꿀 수 있어요. 바꾸고 싶은 내용은 원장님께 말씀해 주세요.</b>}
      </p>

      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

      <Section
        title="🫖 일반 한약 (처방전 기준)"
        desc="한약 처방전을 출력한 뒤, 한약 대기방에서 수령예정일을 넣으면 만들어져요. 수령확인은 한 번의 복용(처방이 이어지는 동안)에서 첫 처방전에만 걸어요."
        example={`예: 내일(${md(sampleStart)}) 수령 → 15일분이면 ${herbSample(15)} / 30일분이면 ${herbSample(30)}`}
      >
        <TimedRules rules={draft.herb} disabled={disabled} onChange={(herb) => set((r) => ({ ...r, herb }))} revisitName="내원 유도" />
      </Section>

      <Section
        title="💊 특수한약 · 그 밖의 비급여 (구매 기준)"
        desc="비급여 현황에서 구매를 등록할 때 수령일과 처방일수를 적으면 만들어져요(공진단·경옥고 등). 처방일수 없이 수령일만 있으면 아래 '한 번만' 규칙이 쓰여요."
        example={`예: 내일(${md(sampleStart)}) 수령, 30일분 → ${specialSample}${specialSingle ? ` / 처방일수 없이 수령일만 → ${md(specialSingle)}` : ''}`}
      >
        <TimedRules rules={draft.special} disabled={disabled} onChange={(special) => set((r) => ({ ...r, special: { ...r.special, ...special } }))} revisitName="연복 권유(내원 유도)" />
        <div style={rowStyle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 190, fontWeight: 700 }}>
            <input type="checkbox" checked={draft.special.withoutSupply.enabled} disabled={disabled} onChange={(e) => set((r) => ({ ...r, special: { ...r.special, withoutSupply: { ...r.special.withoutSupply, enabled: e.target.checked } } }))} />
            처방일수 없을 때 한 번만
          </label>
          <span>수령일 +</span>
          <NumberBox value={draft.special.withoutSupply.days} max={365} disabled={disabled || !draft.special.withoutSupply.enabled} onChange={(days) => set((r) => ({ ...r, special: { ...r.special, withoutSupply: { ...r.special.withoutSupply, days } } }))} />
          <span>일</span>
        </div>
      </Section>

      <Section
        title="🥗 린다이어트"
        desc="비급여 현황에서 린다이어트 결제에 디톡스 시작일을 적으면 만들어져요. 디톡스 기간은 직원 해피콜 목록에, 다이어트환을 시작한 뒤는 원장 케어 보드에 올라가요."
        example={`예: 디톡스 시작 ${md(sampleStart)} → 직원 해피콜 ${mdList(diet.desk)} / 다이어트환 시작 ${md(diet.pillStart)} → 원장 매일 ${mdList(diet.ownerDaily)} / 주 1회 ${mdList(diet.weekly)}`}
      >
        <div style={rowStyle}>
          <span style={{ minWidth: 250, fontWeight: 700 }}>디톡스 기간 직원 해피콜</span>
          <span>디톡스 시작일부터 매일</span>
          <NumberBox value={draft.diet.detoxCallDays} max={MAX_DETOX_CALL_DAYS} disabled={disabled} onChange={(detoxCallDays) => set((r) => ({ ...r, diet: { ...r.diet, detoxCallDays } }))} />
          <span>일 (0이면 안 함, 최대 {MAX_DETOX_CALL_DAYS}일)</span>
        </div>
        <div style={rowStyle}>
          <span style={{ minWidth: 250, fontWeight: 700 }}>다이어트환 시작 후 원장 카톡(매일)</span>
          <span>다이어트환 시작일부터 매일</span>
          <NumberBox value={draft.diet.pillDailyDays} max={MAX_PILL_DAILY_DAYS} disabled={disabled} onChange={(pillDailyDays) => set((r) => ({ ...r, diet: { ...r.diet, pillDailyDays } }))} />
          <span>일 (0이면 안 함)</span>
        </div>
        <div style={rowStyle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 250, fontWeight: 700 }}>
            <input type="checkbox" checked={draft.diet.weeklyEnabled} disabled={disabled} onChange={(e) => set((r) => ({ ...r, diet: { ...r.diet, weeklyEnabled: e.target.checked } }))} />
            그 뒤 주 1회 원장 문안
          </label>
          <span>매주</span>
          <select className="input-field" style={{ width: 70, padding: '6px 8px' }} value={draft.diet.weeklyWeekday} disabled={disabled || !draft.diet.weeklyEnabled} onChange={(e) => set((r) => ({ ...r, diet: { ...r.diet, weeklyWeekday: e.target.value as Weekday } }))}>
            {WEEKDAYS.map((w) => (
              <option key={w} value={w}>{w}요일</option>
            ))}
          </select>
          <NumberBox value={draft.diet.weeklyWeeks} min={1} max={MAX_WEEKLY_WEEKS} disabled={disabled || !draft.diet.weeklyEnabled} onChange={(weeklyWeeks) => set((r) => ({ ...r, diet: { ...r.diet, weeklyWeeks } }))} />
          <span>주 동안</span>
        </div>
      </Section>

      {isOwner && (
        <div className="card" style={{ padding: 16, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary" disabled={busy !== null || !dirty} onClick={() => handleSave(true)}>
            {busy ? '처리 중...' : '저장하고 이미 잡힌 해피콜에도 적용'}
          </button>
          <button style={{ ...smallBtn, padding: '10px 16px', fontSize: 14, fontWeight: 600 }} disabled={busy !== null || !dirty} onClick={() => handleSave(false)}>
            저장만 (앞으로 만드는 해피콜부터)
          </button>
          <button style={{ ...smallBtn, padding: '10px 16px', fontSize: 14, fontWeight: 600 }} disabled={busy !== null || dirty} onClick={handleApplyOnly} title="저장된 규칙을 이미 잡힌(아직 전화하지 않은) 해피콜에 적용합니다.">
            저장된 규칙을 이미 잡힌 해피콜에 적용
          </button>
          <button style={{ ...smallBtn, padding: '10px 16px', fontSize: 14, fontWeight: 600 }} disabled={busy !== null || rulesEqual(draft, DEFAULT_RULES)} onClick={() => { setDraft(DEFAULT_RULES); setMessage(''); }}>
            기본값으로 되돌리기
          </button>
          {dirty && <span style={{ color: 'var(--color-error)', fontSize: 13, fontWeight: 700 }}>⚠ 바꾼 내용이 아직 저장되지 않았어요.</span>}
        </div>
      )}

      {message && <p style={{ color: 'var(--color-green)', fontWeight: 700, marginBottom: 10 }}>{message}</p>}
      {applied && (
        <div className="card" style={{ padding: 14, marginBottom: 14, fontSize: 14 }}>
          <b>적용 결과</b>
          <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
            <li>구매 기준 해피콜: {applied.purchases.checked}건 확인 · 날짜 변경 {applied.purchases.moved} · 새로 만듦 {applied.purchases.created} · 지움 {applied.purchases.removed}</li>
            <li>처방전 기준 해피콜: {applied.herbOrders.checked}건 확인{applied.herbOrders.failed > 0 ? ` (${applied.herbOrders.failed}건은 실패)` : ''}</li>
            <li>린다이어트 직원 해피콜: {applied.dietPrograms.checked}명 확인{applied.dietPrograms.failed > 0 ? ` (${applied.dietPrograms.failed}명은 실패)` : ''}</li>
          </ul>
        </div>
      )}

      <p className="muted-text" style={{ fontSize: 12 }}>
        {state.saved ? `마지막 변경: ${state.updatedAt ? new Date(state.updatedAt).toLocaleString('ko-KR') : ''}${editorName ? ` · ${editorName}` : ''}` : '아직 한 번도 저장하지 않아서 지금까지 쓰던 기본 규칙이 쓰이고 있어요.'}
        {state.appliedAt ? ` · 이미 잡힌 해피콜에 마지막으로 적용: ${new Date(state.appliedAt).toLocaleString('ko-KR')}` : ''}
      </p>
    </div>
  );
}

const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--color-line)', fontSize: 14 } as const;

function Section({ title, desc, example, children }: { title: string; desc: string; example: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 18, marginBottom: 14 }}>
      <h2 style={{ fontSize: 17, marginBottom: 4 }}>{title}</h2>
      <p className="muted-text" style={{ fontSize: 13, marginBottom: 8 }}>{desc}</p>
      {children}
      <p style={{ marginTop: 10, fontSize: 13, background: 'var(--color-bg, #f6f7f4)', borderRadius: 8, padding: '8px 10px' }}>{example}</p>
    </section>
  );
}

function NumberBox({ value, min = 0, max, disabled, onChange }: { value: number; min?: number; max: number; disabled: boolean; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      className="input-field"
      style={{ width: 72, padding: '6px 8px' }}
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === '' ? min : Number(e.target.value))}
    />
  );
}

const TIMED_ROWS = [
  { key: 'pickupCheck', label: '수령확인' },
  { key: 'middle', label: '중간상담' },
  { key: 'revisit', label: '' },
] as const;

function TimedRules({ rules, disabled, onChange, revisitName }: { rules: TimedCallRules; disabled: boolean; onChange: (r: TimedCallRules) => void; revisitName: string }) {
  function update(key: keyof TimedCallRules, patch: Partial<CallTiming>) {
    onChange({ ...rules, [key]: { ...rules[key], ...patch } });
  }
  return (
    <>
      {TIMED_ROWS.map(({ key, label }) => {
        const t = rules[key];
        const modes: TimingMode[] = key === 'middle' ? ['after-pickup', 'before-end', 'auto'] : ['after-pickup', 'before-end'];
        return (
          <div key={key} style={rowStyle}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 190, fontWeight: 700 }}>
              <input type="checkbox" checked={t.enabled} disabled={disabled} onChange={(e) => update(key, { enabled: e.target.checked })} />
              {label || revisitName}
            </label>
            <select className="input-field" style={{ width: 'auto', padding: '6px 8px' }} value={t.mode} disabled={disabled || !t.enabled} onChange={(e) => update(key, { mode: e.target.value as TimingMode })}>
              {modes.map((m) => (
                <option key={m} value={m}>{MODE_LABEL[m]}</option>
              ))}
            </select>
            {t.mode !== 'auto' && (
              <>
                <NumberBox value={t.days} max={365} disabled={disabled || !t.enabled} onChange={(days) => update(key, { days })} />
                <span>일{t.mode === 'after-pickup' ? ' 뒤' : ' 전'}</span>
              </>
            )}
            {t.mode === 'auto' && <span className="muted-text" style={{ fontSize: 12 }}>(15일분 → 12일 뒤, 30일분 → 25일 뒤)</span>}
          </div>
        );
      })}
    </>
  );
}
