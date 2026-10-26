// 자료실(복용법·접수증 같은 한의원 문서) — 순수 로직. 업로드·목록은 src/lib/supabase/clinicDocuments.ts.

export const DOCUMENT_CATEGORIES = ['복용법', '접수증', '동의서', '안내문', '기타'] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** 파일 하나의 최대 크기(버킷 설정과 같은 50MB) */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

export function isDocumentCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}

/** 제목을 따로 안 적으면 파일 이름에서 확장자를 뗀 것을 쓴다. */
export function defaultTitle(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  return base.trim() || fileName;
}

/**
 * 저장소에 둘 경로 — 한글·공백이 든 파일 이름은 저장소 주소로 쓰면 거부될 수 있어서 id + 영숫자 확장자만 쓴다.
 * (원래 이름은 표의 file_name 에 따로 남는다.)
 */
export function storagePathFor(id: string, fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  return /^[a-z0-9]{1,8}$/.test(ext) ? `${id}.${ext}` : id;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes < 0) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export interface DocumentRow {
  title: string;
  category: string;
  fileName: string;
}

/** 분류와 검색어(제목·파일 이름)로 거른다. 분류가 null 이면 전체. */
export function filterDocuments<T extends DocumentRow>(docs: T[], category: string | null, query: string): T[] {
  const q = query.trim().toLowerCase();
  return docs.filter((d) => (category == null || d.category === category) && (!q || d.title.toLowerCase().includes(q) || d.fileName.toLowerCase().includes(q)));
}
