import { describe, expect, it } from 'vitest';
import { defaultTitle, filterDocuments, formatFileSize, isDocumentCategory, storagePathFor } from './clinicDocuments';

describe('defaultTitle', () => {
  it('확장자를 뗀다', () => {
    expect(defaultTitle('한약 복용법 안내.pdf')).toBe('한약 복용법 안내');
    expect(defaultTitle('a.b.docx')).toBe('a.b');
  });
  it('확장자가 없거나 점으로 시작하면 이름 그대로', () => {
    expect(defaultTitle('메모')).toBe('메모');
    expect(defaultTitle('.hidden')).toBe('.hidden');
  });
});

describe('storagePathFor', () => {
  it('한글 이름이어도 id + 영숫자 확장자만 쓴다', () => {
    expect(storagePathFor('abc', '접수증 양식.PDF')).toBe('abc.pdf');
  });
  it('이상한 확장자는 붙이지 않는다', () => {
    expect(storagePathFor('abc', '파일.한글')).toBe('abc');
    expect(storagePathFor('abc', '파일')).toBe('abc');
    expect(storagePathFor('abc', 'x.toolongext1')).toBe('abc');
  });
});

describe('formatFileSize', () => {
  it('단위를 붙인다', () => {
    expect(formatFileSize(500)).toBe('500B');
    expect(formatFileSize(2048)).toBe('2KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0MB');
    expect(formatFileSize(null)).toBe('');
  });
});

describe('filterDocuments / isDocumentCategory', () => {
  const docs = [
    { title: '한약 복용법', category: '복용법', fileName: 'a.pdf' },
    { title: '접수증 양식', category: '접수증', fileName: 'Receipt.docx' },
  ];
  it('분류와 검색어로 거른다(제목·파일 이름, 대소문자 무시)', () => {
    expect(filterDocuments(docs, '복용법', '')).toHaveLength(1);
    expect(filterDocuments(docs, null, '접수')).toHaveLength(1);
    expect(filterDocuments(docs, null, 'receipt')).toHaveLength(1);
    expect(filterDocuments(docs, '접수증', '복용')).toHaveLength(0);
    expect(filterDocuments(docs, null, '')).toHaveLength(2);
  });
  it('분류 확인', () => {
    expect(isDocumentCategory('복용법')).toBe(true);
    expect(isDocumentCategory('없는분류')).toBe(false);
  });
});
