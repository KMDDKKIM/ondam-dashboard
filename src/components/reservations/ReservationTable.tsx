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

// Column order matches the clinic's own spreadsheet template. 앞쪽 5개(예약시간~주치의)는
// 실제 들어가는 내용 길이에 맞춘 고정폭, "결과"(정상이행/노쇼/취소, AttendancePicker)는
// 별도 컬럼으로 다룬다(일반 텍스트칸이 아니라서 EDITABLE_FIELDS에 안 넣는다). 치료부위
// 이후는 폭을 지정하지 않아 남는 공간을 나눠 갖는다 (table-layout: fixed의 나머지-폭 분배).
// 삭제 버튼 컬럼도 폭을 명시해야 한다 — 안 그러면 이 컬럼도 "폭 미지정" 취급되어 치료부위~비고와
// 똑같이 나머지 공간을 나눠 갖게 되어 그만큼을 뺏어간다.
const EDITABLE_FIELDS: { key: keyof Reservation; label: string; width?: string }[] = [
  { key: 'timeLabel', label: '예약시간', width: '56px' },
  { key: 'patientName', label: '성함', width: '56px' },
  { key: 'chartNo', label: '차트번호', width: '62px' },
  { key: 'mobile', label: '휴대전화', width: '108px' },
  { key: 'doctorName', label: '주치의', width: '54px' },
];

const AFTER_DOCTOR_FIELDS: { key: keyof Reservation; label: string }[] = [
  { key: 'treatmentArea', label: '치료부위' },
  { key: 'treatment', label: '치료' },
  { key: 'specialNotes', label: '특이사항' },
  { key: 'memo', label: '비고' },
];

const RESULT_COL_WIDTH = '156px';
const DELETE_COL_WIDTH = '50px';

// "결과": 정상이행/노쇼/취소를 고른다. 같은 걸 다시 누르면 미정으로 되돌린다(붙여넣은 명단에
// 이미 '취소'가 있으면 그 버튼이 처음부터 눌려 있다). "정상이행"은 붙여넣은 표의 '내원' 값과는
// 일부러 다른 문자열이다 — OK차트 예약표는 취소만 아니면 방문 전부터 그 칸에 항상 '내원'을
// 적어 두므로(실제로 왔는지와 무관한 기본값), 그걸 그대로 "정상이행"으로 세면 하루가 시작하기도
// 전에 예약 전원이 정상이행으로 잡힌다. 그래서 직원이 직접 눌러야만 정상이행/노쇼로 표시된다.
// 일일결산의 예약 정상 이행/노쇼를 여기서 직접 센다(countMarkedAttendance,
// reservationReceptionMatch.ts) — 이름 대조보다 훨씬 정확해서, 하나라도 표시해 두면 그 값이 우선한다.
const ATTENDANCE_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: '정상이행', label: '정상이행', color: 'var(--color-green)' },
  { value: '노쇼', label: '노쇼', color: 'var(--color-error)' },
  { value: '취소', label: '취소', color: 'var(--color-muted)' },
];

function AttendancePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {ATTENDANCE_OPTIONS.map((opt) => {
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? '' : opt.value)}
            style={{
              flex: 1,
              padding: '3px 0',
              fontSize: 11,
              fontWeight: on ? 700 : 500,
              borderRadius: 6,
              border: `1px solid ${on ? opt.color : '#ddd'}`,
              background: on ? opt.color : '#fff',
              color: on ? '#fff' : '#555',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

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
          fontSize: 13,
        }}
      >
        <thead>
          <tr>
            {EDITABLE_FIELDS.map((field) => (
              <th key={field.key} style={{ textAlign: 'left', padding: '3px 4px', width: field.width }}>
                {field.label}
              </th>
            ))}
            <th className="no-print" style={{ textAlign: 'left', padding: '3px 4px', width: RESULT_COL_WIDTH }}>
              결과
            </th>
            {AFTER_DOCTOR_FIELDS.map((field) => (
              <th key={field.key} style={{ textAlign: 'left', padding: '3px 4px' }}>
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
                <td key={field.key} style={{ padding: '1px 2px' }}>
                  <input
                    value={row[field.key] as string}
                    onChange={(event) => updateRow(index, field.key, event.target.value)}
                    style={{ fontSize: 13, padding: '3px 4px' }}
                  />
                </td>
              ))}
              <td className="no-print" style={{ padding: '1px 2px' }}>
                <AttendancePicker value={row.visitStatus} onChange={(v) => updateRow(index, 'visitStatus', v)} />
              </td>
              {AFTER_DOCTOR_FIELDS.map((field) => (
                <td key={field.key} style={{ padding: '1px 2px' }}>
                  <input
                    value={row[field.key] as string}
                    onChange={(event) => updateRow(index, field.key, event.target.value)}
                    style={{ fontSize: 13, padding: '3px 4px' }}
                  />
                </td>
              ))}
              <td className="no-print" style={{ padding: '2px 4px', textAlign: 'right' }}>
                <button onClick={() => removeRow(index)} style={{ padding: '3px 7px', fontSize: 12 }}>
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
