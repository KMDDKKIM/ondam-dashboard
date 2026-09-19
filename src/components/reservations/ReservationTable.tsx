'use client';

import type { Reservation } from '@/lib/reservations/types';

interface ReservationTableProps {
  reservations: Reservation[];
  onChange: (rows: Reservation[]) => void;
  onSave: () => void;
}

const EMPTY_ROW: Reservation = {
  doctorName: '',
  timeLabel: '',
  patientName: '',
  chartNo: '',
  phone: '',
  mobile: '',
  visitStatus: '',
  treatmentArea: '',
  treatment: '',
  specialNotes: '',
  memo: '',
};

// Column order matches the clinic's own spreadsheet template. 예약 이행 상태
// (reservation-fulfillment dropdown) is intentionally not shown — the memo
// already covers 부도/취소 tallies. 앞쪽 5개(예약시간~주치의)는 실제 들어가는
// 내용 길이에 맞춘 고정폭, 치료부위 이후는 폭을 지정하지 않아 남는 공간을
// 나눠 갖는다 (table-layout: fixed의 나머지-폭 분배). 삭제 버튼 컬럼도 폭을
// 명시해야 한다 — 안 그러면 이 컬럼도 "폭 미지정" 취급되어 치료부위~비고와
// 똑같이 나머지 공간을 나눠 갖게 되어 그만큼을 뺏어간다.
const EDITABLE_FIELDS: { key: keyof Reservation; label: string; width?: string }[] = [
  { key: 'timeLabel', label: '예약시간', width: '46px' },
  { key: 'patientName', label: '성함', width: '40px' },
  { key: 'chartNo', label: '차트번호', width: '48px' },
  { key: 'mobile', label: '휴대전화', width: '92px' },
  { key: 'doctorName', label: '주치의', width: '44px' },
  { key: 'treatmentArea', label: '치료부위' },
  { key: 'treatment', label: '치료' },
  { key: 'specialNotes', label: '특이사항' },
  { key: 'memo', label: '비고' },
];

const DELETE_COL_WIDTH = '44px';

export function ReservationTable({ reservations, onChange, onSave }: ReservationTableProps) {
  function updateRow(index: number, field: keyof Reservation, value: string) {
    onChange(reservations.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function removeRow(index: number) {
    onChange(reservations.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...reservations, { ...EMPTY_ROW }]);
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <table
        className="reservation-table"
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          fontSize: 10,
        }}
      >
        <thead>
          <tr>
            {EDITABLE_FIELDS.map((field) => (
              <th
                key={field.key}
                style={{ textAlign: 'left', padding: '3px 4px', width: field.width }}
              >
                {field.label}
              </th>
            ))}
            <th className="no-print" style={{ width: DELETE_COL_WIDTH }} />
          </tr>
        </thead>
        <tbody>
          {reservations.map((row, index) => (
            <tr key={index}>
              {EDITABLE_FIELDS.map((field) => (
                <td key={field.key} style={{ padding: '0px 2px' }}>
                  <input
                    value={row[field.key] as string}
                    onChange={(event) => updateRow(index, field.key, event.target.value)}
                    style={{ fontSize: 10, padding: '2px 3px' }}
                  />
                </td>
              ))}
              <td className="no-print" style={{ padding: '2px 4px', textAlign: 'right' }}>
                <button
                  onClick={() => removeRow(index)}
                  style={{ padding: '2px 6px', fontSize: 10 }}
                >
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="no-print">
        <button onClick={addRow} style={{ marginTop: 8 }}>
          행 추가
        </button>
        <button
          onClick={onSave}
          style={{ marginTop: 8, marginLeft: 8, background: 'var(--color-teal-deep)', color: '#fff' }}
        >
          예약자 명단 저장
        </button>
      </div>
    </div>
  );
}
