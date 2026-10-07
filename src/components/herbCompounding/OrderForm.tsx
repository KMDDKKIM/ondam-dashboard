'use client';

import { useRef, useState } from 'react';
import { confirmDialog } from '@/lib/confirmDialog';
import type { HerbCompoundingOrder } from '@/lib/herbCompounding';
import { computePackCount, duplicateHerbNames, herbLineTotal, mergeHerbLines, parseHerbGramsEntry, sortHerbLinesByGrams, totalHerbWeight } from '@/lib/herbCompounding';
import type { KnownHerbPatient } from '@/lib/supabase/herbCompounding';
import { FormulaPicker } from './FormulaPicker';
import { PatientSearch } from './PatientSearch';

interface OrderFormProps {
  value: HerbCompoundingOrder;
  onChange: (next: HerbCompoundingOrder) => void;
  /** 약재명 입력칸의 자동완성 후보(한약재 재고 현황의 약재 목록). */
  herbNameOptions: string[];
  /** 전에 저장한 적 있는 환자(이름+차트번호) — 환자명 칸에서 검색·선택용. */
  knownPatients: KnownHerbPatient[];
  /** 이름은 있는데 그램이 없거나 반대인 줄 번호(1부터) — 저장 전 확인 표시용. */
  incompleteLines: number[];
}

const labelStyle = { display: 'block', fontSize: 12, color: 'var(--color-muted)', marginBottom: 4 };
const fieldStyle = { marginBottom: 14 };

// 약재 목록 표에서 Tab으로 다음 줄의 같은 칸으로 내려가게 한다(기본은 옆 칸으로 가는데,
// 한 칸씩 쭉 내려 채우는 입력 방식이 더 빨라서 — 원장 요청, 2026-10-02). 칸 순서: 약재명 → 수치 → 1첩당(g).
const HERB_ROW_COLS = 3;

export function OrderForm({ value, onChange, herbNameOptions, knownPatients, incompleteLines }: OrderFormProps) {
  const [bulkText, setBulkText] = useState('');
  const [bulkWarning, setBulkWarning] = useState('');
  const herbCellRefs = useRef<(HTMLInputElement | null)[][]>([]);

  function setHerbCellRef(row: number, col: number, el: HTMLInputElement | null) {
    if (!herbCellRefs.current[row]) herbCellRefs.current[row] = [];
    herbCellRefs.current[row][col] = el;
  }

  function handleHerbCellTab(e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const rowCount = value.herbs.length;
    if (rowCount === 0) return;
    let r = row + (e.shiftKey ? -1 : 1);
    let c = col;
    if (r >= rowCount) { r = 0; c += 1; }
    if (r < 0) { r = rowCount - 1; c -= 1; }
    c = ((c % HERB_ROW_COLS) + HERB_ROW_COLS) % HERB_ROW_COLS;
    const target = herbCellRefs.current[r]?.[c];
    target?.focus();
    target?.select();
  }

  function set<K extends keyof HerbCompoundingOrder>(key: K, v: HerbCompoundingOrder[K]) {
    onChange({ ...value, [key]: v });
  }

  // "당귀 천궁 백출 4 산사 신곡 맥아 2" 처럼 붙여넣으면, 숫자 앞에 나온 이름들 전부에 그
  // 숫자를 1첩당 그램으로 적용해 약재 목록에 더한다(이미 채운 줄은 지우지 않는다).
  function applyBulkText() {
    if (bulkText.trim() === '') return;
    const parsed = parseHerbGramsEntry(bulkText);
    if (parsed.herbs.length === 0) {
      setBulkWarning('숫자(그램)가 붙은 약재명을 찾지 못했어요. "당귀 천궁 4"처럼 이름 뒤에 숫자를 넣어주세요.');
      return;
    }
    onChange({ ...value, herbs: mergeHerbLines(value.herbs, parsed.herbs) });
    setBulkWarning(
      parsed.danglingNames.length > 0 ? `그램이 안 붙어서 반영 못 한 이름: ${parsed.danglingNames.join(', ')}` : ''
    );
    setBulkText('');
  }

  function updateHerb(index: number, patch: Partial<{ herbName: string; prepMethod: string; gramsPerPacket: number }>) {
    onChange({
      ...value,
      herbs: value.herbs.map((h, i) => (i === index ? { ...h, ...patch } : h)),
    });
  }

  function addHerbRow() {
    onChange({ ...value, herbs: [...value.herbs, { herbName: '', prepMethod: '', gramsPerPacket: 0 }] });
  }

  function removeHerbRow(index: number) {
    onChange({ ...value, herbs: value.herbs.filter((_, i) => i !== index) });
  }

  // 넣어 둔 약재를 한 번에 지우고 빈 줄 하나로 되돌린다(약재 외 환자명·첩수 등은 그대로). 실수로 누르지 않게 확인을 받는다.
  async function clearAllHerbs() {
    const filled = value.herbs.filter((h) => h.herbName.trim() !== '' || h.prepMethod.trim() !== '' || h.gramsPerPacket > 0).length;
    if (filled === 0) return;
    if (!(await confirmDialog(`약재 ${filled}개를 모두 지울까요?`, { confirmLabel: '모두 삭제' }))) return;
    onChange({ ...value, herbs: [{ herbName: '', prepMethod: '', gramsPerPacket: 0 }] });
  }

  function sortByGrams(direction: 'asc' | 'desc') {
    onChange({ ...value, herbs: sortHerbLinesByGrams(value.herbs, direction) });
  }

  // 며칠분은 첩수와 같이 움직이는 게 기본(하루 한 첩 관례)이다. 며칠분을 아직 안 건드렸으면
  // (첩수와 같거나 0이면) 첩수를 따라가게 하고, 직접 다르게 고쳤으면 더 이상 안 따라간다.
  function setPacketCount(next: number) {
    const inSync = value.daysSupply === value.packetCount || value.daysSupply === 0;
    const nextDaysSupply = inSync ? next : value.daysSupply;
    onChange({ ...value, packetCount: next, daysSupply: nextDaysSupply, packCount: computePackCount(value.dosesPerDay, nextDaysSupply) });
  }

  function setDaysSupply(next: number) {
    onChange({ ...value, daysSupply: next, packCount: computePackCount(value.dosesPerDay, next) });
  }

  function setDosesPerDay(next: number) {
    onChange({ ...value, dosesPerDay: next, packCount: computePackCount(next, value.daysSupply) });
  }

  const total = totalHerbWeight(value.herbs, value.packetCount);
  const duplicates = duplicateHerbNames(value.herbs);
  const isDuplicate = (name: string) => duplicates.includes(name.trim());

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>환자명 (전에 저장한 적 있으면 검색돼요)</label>
          <PatientSearch
            value={value.patientName}
            onChange={(name) => set('patientName', name)}
            knownPatients={knownPatients}
            onPick={(p) => onChange({ ...value, patientName: p.patientName, chartNo: p.chartNo })}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>차트번호</label>
          <input className="input-field" value={value.chartNo} onChange={(e) => set('chartNo', e.target.value)} placeholder="선택" />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>날짜</label>
          <input className="input-field" type="date" value={value.orderDate} onChange={(e) => set('orderDate', e.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>첩수</label>
          <input
            className="input-field"
            type="number"
            min={1}
            value={value.packetCount || ''}
            onChange={(e) => setPacketCount(Number(e.target.value) || 0)}
            placeholder="10"
          />
        </div>
      </div>

      {/* 팩용량·며칠분·팩수·총물량은 부가 정보라, 환자·첩수 칸보다 눈에 덜 띄게 한 줄로
          압축했다(원장 요청, 2026-09-29 — 위쪽에 두되 칸을 작게). */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          padding: '8px 12px',
          marginBottom: 14,
          borderRadius: 10,
          background: 'var(--color-surface-2)',
        }}
      >
        <span className="muted-text" style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
          탕전 정보(선택)
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--color-muted)' }}>
          처방명
          <input
            className="input-field"
            value={value.prescriptionName}
            onChange={(e) => set('prescriptionName', e.target.value)}
            placeholder="예: 보중익기탕"
            style={{ width: 120, padding: '4px 6px', fontSize: 13 }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--color-muted)' }}>
          팩용량
          <input
            className="input-field"
            type="number"
            min={0}
            value={value.packVolumeMl || ''}
            onChange={(e) => set('packVolumeMl', Number(e.target.value) || 0)}
            style={{ width: 56, padding: '4px 6px', fontSize: 13 }}
          />
          mL
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--color-muted)' }}>
          며칠분
          <input
            className="input-field"
            type="number"
            min={0}
            value={value.daysSupply || ''}
            onChange={(e) => setDaysSupply(Number(e.target.value) || 0)}
            title="기본은 첩수와 같이 움직여요(하루 한 첩 관례). 직접 고치면 더 이상 첩수를 안 따라가요."
            style={{ width: 56, padding: '4px 6px', fontSize: 13 }}
          />
          일
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--color-muted)' }}>
          하루 몇 번 복용
          <input
            className="input-field"
            type="number"
            min={0}
            value={value.dosesPerDay || ''}
            onChange={(e) => setDosesPerDay(Number(e.target.value) || 0)}
            style={{ width: 56, padding: '4px 6px', fontSize: 13 }}
          />
          회
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--color-muted)' }}>
          팩수
          <span
            title="하루 몇 번 복용 × 며칠분으로 자동 계산돼요"
            style={{ width: 56, padding: '4px 6px', fontSize: 13, color: 'var(--color-ink)' }}
          >
            {value.packCount || 0}
          </span>
          팩(자동)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--color-muted)' }}>
          총물량
          <input
            className="input-field"
            type="number"
            min={0}
            value={value.totalLiquidMl || ''}
            onChange={(e) => set('totalLiquidMl', Number(e.target.value) || 0)}
            // 총물량은 보통 10000~11000(mL)이라 다섯 자리가 잘리지 않게 넓힌다(원장 요청, 2026-10-07).
            style={{ width: 104, padding: '4px 6px', fontSize: 13 }}
          />
          mL
        </label>
      </div>

      <FormulaPicker value={value} onChange={onChange} />

      <div style={fieldStyle}>
        <label style={labelStyle}>약재 일괄 입력 — "당귀 천궁 백출 4 산사 신곡 맥아 2"처럼 이름 뒤에 그램을 적으면, 그 앞의 이름들에 한꺼번에 적용돼요</label>
        <textarea
          className="input-field"
          style={{ minHeight: 48 }}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder="당귀 천궁 백출 4 산사 신곡 맥아 2"
        />
        <button type="button" onClick={applyBulkText} style={{ marginTop: 6 }}>
          약재 목록에 적용
        </button>
        {bulkWarning && <p className="error-text">{bulkWarning}</p>}
      </div>

      <label style={labelStyle}>약재 목록 — 1첩당 그램을 넣으면 첩수를 곱해 총용량을 계산해요</label>
      <datalist id="herb-name-options">
        {herbNameOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 8 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '4px 4px', width: 30 }}>No.</th>
            <th style={{ textAlign: 'left', padding: '4px 4px' }}>약재명</th>
            <th style={{ textAlign: 'left', padding: '4px 4px', width: 90 }}>수치</th>
            <th style={{ textAlign: 'left', padding: '4px 4px', width: 110 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                1첩당(g)
                <button
                  type="button"
                  onClick={() => sortByGrams('asc')}
                  title="1첩당 그램 오름차순 정렬"
                  aria-label="1첩당 그램 오름차순 정렬"
                  style={{ padding: '0 2px', fontSize: 11, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => sortByGrams('desc')}
                  title="1첩당 그램 내림차순 정렬"
                  aria-label="1첩당 그램 내림차순 정렬"
                  style={{ padding: '0 2px', fontSize: 11, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
                >
                  ▼
                </button>
              </span>
            </th>
            <th style={{ textAlign: 'left', padding: '4px 4px', width: 110 }}>총용량(g)</th>
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {value.herbs.map((herb, i) => (
            <tr
              key={i}
              style={isDuplicate(herb.herbName) ? { background: 'rgba(209, 69, 59, 0.16)' } : incompleteLines.includes(i + 1) ? { background: 'rgba(209, 69, 59, 0.08)' } : undefined}
            >
              <td style={{ padding: '2px 4px', color: 'var(--color-muted)' }}>{i + 1}</td>
              <td style={{ padding: '2px 4px' }}>
                <input
                  ref={(el) => setHerbCellRef(i, 0, el)}
                  className="input-field"
                  list="herb-name-options"
                  value={herb.herbName}
                  onChange={(e) => updateHerb(i, { herbName: e.target.value })}
                  onKeyDown={(e) => handleHerbCellTab(e, i, 0)}
                  placeholder="당귀"
                  style={isDuplicate(herb.herbName) ? { color: 'var(--color-error)', fontWeight: 700, borderColor: 'var(--color-error)' } : undefined}
                  aria-invalid={isDuplicate(herb.herbName) || undefined}
                />
              </td>
              <td style={{ padding: '2px 4px' }}>
                <input
                  ref={(el) => setHerbCellRef(i, 1, el)}
                  className="input-field"
                  value={herb.prepMethod}
                  onChange={(e) => updateHerb(i, { prepMethod: e.target.value })}
                  onKeyDown={(e) => handleHerbCellTab(e, i, 1)}
                />
              </td>
              <td style={{ padding: '2px 4px' }}>
                <input
                  ref={(el) => setHerbCellRef(i, 2, el)}
                  className="input-field"
                  type="number"
                  min={0}
                  step={0.1}
                  value={herb.gramsPerPacket || ''}
                  onChange={(e) => updateHerb(i, { gramsPerPacket: Number(e.target.value) || 0 })}
                  onKeyDown={(e) => handleHerbCellTab(e, i, 2)}
                  placeholder="6"
                />
              </td>
              <td style={{ padding: '2px 4px' }}>{herbLineTotal(herb, value.packetCount)}</td>
              <td style={{ padding: '2px 4px', textAlign: 'right' }}>
                <button type="button" onClick={() => removeHerbRow(i)} style={{ padding: '4px 8px', fontSize: 12 }}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {duplicates.length > 0 && (
        <p className="error-text" role="alert" style={{ fontWeight: 700 }}>
          ⚠ 겹치는 약재: {duplicates.join(', ')} — 용량은 합치지 않았어요. 줄을 확인해 하나로 정리해 주세요.
        </p>
      )}
      {incompleteLines.length > 0 && (
        <p className="error-text">약재명과 그램을 둘 다 채워주세요: {incompleteLines.join(', ')}번 줄</p>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button type="button" onClick={addHerbRow}>
          약재 추가
        </button>
        <button type="button" onClick={clearAllHerbs} style={{ color: 'var(--color-error)' }}>
          약재 전체 삭제
        </button>
      </div>

      <p style={{ fontWeight: 700, marginBottom: 14 }}>약재 총량: {total.toLocaleString('ko-KR')}g</p>

      <div style={fieldStyle}>
        <label style={labelStyle}>메모</label>
        <textarea
          className="input-field"
          style={{ minHeight: 56 }}
          value={value.memo}
          onChange={(e) => set('memo', e.target.value)}
          placeholder="선택 — 조제 시 참고할 내용"
        />
      </div>
    </div>
  );
}
