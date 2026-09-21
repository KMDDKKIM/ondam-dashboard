// CSV 만들기(순수 함수). 엑셀에서 한글이 깨지지 않게 UTF-8 BOM을 붙이고,
// 쉼표·따옴표·줄바꿈이 든 칸은 따옴표로 감싸며, 엑셀 수식 주입(=, +, -, @ 로 시작하는 글자)을 막는다.

export const CSV_BOM = '﻿';

// 엑셀이 수식으로 읽는 첫 글자. 탭·줄바꿈으로 시작하는 칸도 같은 위험이 있어 함께 막는다.
const FORMULA_START = /^[=+\-@\t\r]/;

const PLAIN_NUMBER = /^-?\d+([.,]\d+)?$/;

export type CsvValue = string | number | boolean | null | undefined | Array<string | number>;

/** 칸 하나를 CSV 글자로. 숫자는 그대로(음수 금액이 수식으로 오인되지 않게), 글자만 수식 주입을 막는다. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (typeof value === 'number') {
    text = Number.isFinite(value) ? String(value) : '';
    return text;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  text = Array.isArray(value) ? value.join('; ') : value;
  // 글자로 저장된 음수 금액(-5000) 같은 평범한 숫자는 수식이 아니므로 그대로 둔다.
  if (FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** 머리글 + 행들을 CSV(맨 앞에 BOM, 줄은 CRLF)로. */
export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}
