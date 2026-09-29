'use client';

import { useState } from 'react';
import type { HerbCompoundingOrder } from '@/lib/herbCompounding';
import { herbLineTotal, mergeHerbLines, parseHerbGramsEntry, totalHerbWeight } from '@/lib/herbCompounding';
import type { KnownHerbPatient } from '@/lib/supabase/herbCompounding';
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

export function OrderForm({ value, onChange, herbNameOptions, knownPatients, incompleteLines }: OrderFormProps) {
  const [bulkText, setBulkText] = useState('');
  const [bulkWarning, setBulkWarning] = useState('');

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

  const total = totalHerbWeight(value.herbs, value.packetCount);

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
            onChange={(e) => set('packetCount', Number(e.target.value) || 0)}
            placeholder="10"
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>팩용량(mL)</label>
          <input
            className="input-field"
            type="number"
            min={0}
            value={value.packVolumeMl || ''}
            onChange={(e) => set('packVolumeMl', Number(e.target.value) || 0)}
            placeholder="선택"
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>며칠분</label>
          <input
            className="input-field"
            type="number"
            min={0}
            value={value.daysSupply || ''}
            onChange={(e) => set('daysSupply', Number(e.target.value) || 0)}
            placeholder="선택"
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>팩수</label>
          <input
            className="input-field"
            type="number"
            min={0}
            value={value.packCount || ''}
            onChange={(e) => set('packCount', Number(e.target.value) || 0)}
            placeholder="선택"
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>총물량(mL)</label>
          <input
            className="input-field"
            type="number"
            min={0}
            value={value.totalLiquidMl || ''}
            onChange={(e) => set('totalLiquidMl', Number(e.target.value) || 0)}
            placeholder="선택"
          />
        </div>
      </div>

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
            <th style={{ textAlign: 'left', padding: '4px 4px', width: 110 }}>1첩당(g)</th>
            <th style={{ textAlign: 'left', padding: '4px 4px', width: 110 }}>총용량(g)</th>
            <th style={{ textAlign: 'left', padding: '4px 4px', width: 90 }}>수치</th>
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {value.herbs.map((herb, i) => (
            <tr key={i} style={incompleteLines.includes(i + 1) ? { background: 'rgba(209, 69, 59, 0.08)' } : undefined}>
              <td style={{ padding: '2px 4px', color: 'var(--color-muted)' }}>{i + 1}</td>
              <td style={{ padding: '2px 4px' }}>
                <input
                  className="input-field"
                  list="herb-name-options"
                  value={herb.herbName}
                  onChange={(e) => updateHerb(i, { herbName: e.target.value })}
                  placeholder="당귀"
                />
              </td>
              <td style={{ padding: '2px 4px' }}>
                <input
                  className="input-field"
                  type="number"
                  min={0}
                  step={0.1}
                  value={herb.gramsPerPacket || ''}
                  onChange={(e) => updateHerb(i, { gramsPerPacket: Number(e.target.value) || 0 })}
                  placeholder="6"
                />
              </td>
              <td style={{ padding: '2px 4px' }}>{herbLineTotal(herb, value.packetCount)}</td>
              <td style={{ padding: '2px 4px' }}>
                <input
                  className="input-field"
                  value={herb.prepMethod}
                  onChange={(e) => updateHerb(i, { prepMethod: e.target.value })}
                />
              </td>
              <td style={{ padding: '2px 4px', textAlign: 'right' }}>
                <button type="button" onClick={() => removeHerbRow(i)} style={{ padding: '4px 8px', fontSize: 12 }}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {incompleteLines.length > 0 && (
        <p className="error-text">약재명과 그램을 둘 다 채워주세요: {incompleteLines.join(', ')}번 줄</p>
      )}
      <button type="button" onClick={addHerbRow} style={{ marginBottom: 14 }}>
        약재 추가
      </button>

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
