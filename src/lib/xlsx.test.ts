import { describe, expect, it } from 'vitest';
import { buildXlsx, columnName } from './xlsx';

// ZIP 한가운데 목록(중앙 디렉터리)을 읽어 파일 이름·크기를 확인하는 아주 작은 해석기.
function listZip(bytes: Uint8Array): { name: string; size: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  expect(end).toBeGreaterThanOrEqual(0);
  const count = view.getUint16(end + 10, true);
  let pos = view.getUint32(end + 16, true);
  const out: { name: string; size: number }[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(pos, true)).toBe(0x02014b50);
    const size = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    out.push({ name: new TextDecoder().decode(bytes.slice(pos + 46, pos + 46 + nameLen)), size });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function readEntry(bytes: Uint8Array, name: string): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  while (pos < bytes.length && view.getUint32(pos, true) === 0x04034b50) {
    const size = view.getUint32(pos + 18, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    const entryName = new TextDecoder().decode(bytes.slice(pos + 30, pos + 30 + nameLen));
    const dataStart = pos + 30 + nameLen + extraLen;
    if (entryName === name) return new TextDecoder().decode(bytes.slice(dataStart, dataStart + size));
    pos = dataStart + size;
  }
  throw new Error(`${name} 없음`);
}

describe('columnName', () => {
  it('A·Z·AA 순서', () => {
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
    expect(columnName(26)).toBe('AA');
    expect(columnName(27)).toBe('AB');
  });
});

describe('buildXlsx', () => {
  const bytes = buildXlsx('비급여 구매기록', ['구매일', '환자', '금액(원)'], [['2026-10-01', '가나다', 120000], ['2026-10-02', '=SUM(A1)', null]]);

  it('엑셀이 요구하는 파일들이 모두 들어 있다', () => {
    expect(listZip(bytes).map((e) => e.name).sort()).toEqual(
      ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'].sort()
    );
  });

  it('숫자는 숫자 칸으로, 글자는 글자 칸으로 들어가고 수식처럼 읽히는 글자도 글자로 남는다', () => {
    const sheet = readEntry(bytes, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<c r="C2"><v>120000</v></c>');
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain('=SUM(A1)'); // <f> 수식이 아니라 글자
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain('가나다');
  });

  it('머리글 줄은 굵은 서식(s=1)으로, 첫 줄을 고정한다', () => {
    const sheet = readEntry(bytes, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1">');
    expect(sheet).toContain('state="frozen"');
  });

  it('시트 이름과 XML 특수문자를 안전하게 처리한다', () => {
    const b = buildXlsx('a/b:c?*[x]', ['<머리>'], [['&"<>']]);
    expect(readEntry(b, 'xl/workbook.xml')).toContain('name="a b c   x"');
    const sheet = readEntry(b, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('&lt;머리&gt;');
    expect(sheet).toContain('&amp;&quot;&lt;&gt;');
  });

  it('행이 하나도 없어도 만들어진다', () => {
    expect(listZip(buildXlsx('빈', ['a', 'b'], [])).length).toBe(6);
  });
});
