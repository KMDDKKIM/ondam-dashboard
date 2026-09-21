import { describe, expect, it } from 'vitest';
import { dedupeMaterial, formatRrn, maskRrn, normalizeRrn, parseFormSubmission, parseFormTimestamp } from './remoteConsult';

describe('parseFormTimestamp', () => {
  it('한국 로케일 시트의 "2026. 9. 21 오후 2:34:56"을 한국 시각으로 읽어 UTC ISO 로 바꾼다', () => {
    expect(parseFormTimestamp('2026. 9. 21 오후 2:34:56')).toBe('2026-09-21T05:34:56.000Z');
    expect(parseFormTimestamp('2026. 9. 21 오전 9:05:00')).toBe('2026-09-21T00:05:00.000Z');
  });

  it('오전 12시는 자정, 오후 12시는 정오', () => {
    expect(parseFormTimestamp('2026. 9. 21 오전 12:10:00')).toBe('2026-09-20T15:10:00.000Z');
    expect(parseFormTimestamp('2026. 9. 21 오후 12:10:00')).toBe('2026-09-21T03:10:00.000Z');
  });

  it('초가 없어도 읽고, 못 읽는 글자는 null', () => {
    expect(parseFormTimestamp('2025. 12. 10 오후 9:42')).toBe('2025-12-10T12:42:00.000Z');
    expect(parseFormTimestamp('')).toBeNull();
    expect(parseFormTimestamp('어제쯤')).toBeNull();
  });
});

describe('normalizeRrn / maskRrn', () => {
  it('하이픈·공백을 무시하고 13자리만 인정한다', () => {
    expect(normalizeRrn('901231-1234567')).toEqual({ rrn: '9012311234567', problem: null });
    expect(normalizeRrn('901231 1234567')).toEqual({ rrn: '9012311234567', problem: null });
    expect(normalizeRrn('')).toEqual({ rrn: null, problem: null });
    expect(normalizeRrn('90123112')).toEqual({ rrn: null, problem: expect.stringContaining('8자리') });
  });

  it('화면에는 앞 7자리만 보이고 뒤는 가린다', () => {
    expect(maskRrn('9012311')).toBe('901231-1******');
    expect(maskRrn(null)).toBe('-');
    expect(maskRrn('9012')).toBe('-');
    expect(formatRrn('9012311234567')).toBe('901231-1234567');
  });
});

describe('parseFormSubmission', () => {
  const namedValues = {
    타임스탬프: ['2026. 9. 21 오후 2:34:56'],
    '원하시는 진료를 선택 해주세요:': ['보폐고 엔오 (비염,후비루,축농증)'],
    '보폐고 엔오 (90포 30만원 / 45포 17만원)': ['45포 17만원'],
    '린다이어트 스탠다드': [''],
    성함: ['홍길동'],
    주민등록번호: ['901231-1234567'],
    핸드폰번호: ['010-0000-0000'],
    '택배 주소지': ['부산시 어딘구 어딘로 1'],
    '비대면 진료를 위한 성함, 연락처 동의': ['개인정보 수집 및 이용에 동의합니다.'],
  };

  it('성함·주민번호·연락처·주소·진료를 질문 제목의 키워드로 찾고, 나머지 답은 목록으로 둔다', () => {
    const p = parseFormSubmission(namedValues);
    expect(p).toMatchObject({
      patientName: '홍길동',
      phone: '010-0000-0000',
      address: '부산시 어딘구 어딘로 1',
      service: '보폐고 엔오 (비염,후비루,축농증)',
      rrn: '9012311234567',
      submittedAt: '2026-09-21T05:34:56.000Z',
    });
    expect(p.answers).toEqual([{ question: '보폐고 엔오 (90포 30만원 / 45포 17만원)', answer: '45포 17만원' }]);
  });

  it('동의 문구와 빈 답은 목록에 넣지 않는다', () => {
    const p = parseFormSubmission(namedValues);
    expect(p.answers.some((a) => a.question.includes('동의'))).toBe(false);
    expect(p.answers.some((a) => a.question.includes('린다이어트'))).toBe(false);
  });

  it('값이 문자열이어도 받고, 타임스탬프가 없으면 받은 시각을 쓴다', () => {
    const now = new Date('2026-09-21T01:00:00Z');
    const p = parseFormSubmission({ 성함: '성춘향', 핸드폰번호: '010-1111-2222' }, now);
    expect(p.patientName).toBe('성춘향');
    expect(p.submittedAt).toBe('2026-09-21T01:00:00.000Z');
  });

  it('주민번호 형식이 이상하면 저장하지 않고 이유를 알려 준다', () => {
    const p = parseFormSubmission({ 성함: '이몽룡', 주민등록번호: '1234' });
    expect(p.rrn).toBeNull();
    expect(p.rrnProblem).toContain('4자리');
  });
});

describe('dedupeMaterial', () => {
  it('원문 시각+이름+연락처 숫자로 같은 응답을 알아본다', () => {
    const a = dedupeMaterial({ rawTimestamp: '2026. 9. 21 오후 2:34:56', patientName: '홍길동', phone: '010-0000-0000', submittedAt: 'x' });
    const b = dedupeMaterial({ rawTimestamp: '2026. 9. 21 오후 2:34:56', patientName: ' 홍길동 ', phone: '01000000000', submittedAt: 'y' });
    expect(a).toBe(b);
  });
});
