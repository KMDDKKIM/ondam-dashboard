import { describe, expect, it } from 'vitest';
import { shortSymptoms, summarizeAnswers } from './remoteSummary';

const landing = [
  { question: '복용하실 분', answer: '자녀' },
  { question: '증상', answer: '코 - 코막힘, 기침 · 가래 - 오래가는 기침' },
  { question: '증상 기간', answer: '1~3개월' },
  { question: '불편 정도', answer: '3 (자주 불편)' },
  { question: '추가로 알려주신 내용', answer: '강의를 많이 합니다' },
  { question: '복용 중인 약', answer: '있음 - 비염 스프레이' },
  { question: '진단받은 질환', answer: '천식' },
  { question: '임신·수유', answer: '해당 없음' },
  { question: '알레르기', answer: '없음' },
  { question: '통화 편한 시간대', answer: '오후, 기타(토요일 오전만 가능)' },
  { question: '생각하시는 수량', answer: '2박스 (30일분, 300,000원)' },
];

describe('summarizeAnswers', () => {
  it('웹페이지 신청은 통화 시간을 맨 앞에, 증상·기간·수량을 짧게 요약한다', () => {
    const { chips, note } = summarizeAnswers(landing);
    expect(chips.slice(0, 4)).toEqual([
      { label: '통화', value: '오후, 기타(토요일 오전만 가능)', tone: 'call' },
      { label: '증상', value: '코막힘, 오래가는 기침', tone: 'main' },
      { label: '기간', value: '1~3개월 · 자주 불편 3/5', tone: 'main' },
      { label: '수량', value: '2박스', tone: 'main' },
    ]);
    expect(note).toBe('강의를 많이 합니다');
  });

  it('본인 아닌 복용자·복용약은 주의 칩, 해당 없음·없음은 칩을 만들지 않는다', () => {
    const warns = summarizeAnswers(landing).chips.filter((c) => c.tone === 'warn');
    expect(warns).toEqual([
      { label: '복용자', value: '자녀', tone: 'warn' },
      { label: '복용약', value: '비염 스프레이', tone: 'warn' },
    ]);
  });

  it('임신·수유, 알레르기가 있으면 주의 칩으로 띄운다', () => {
    const { chips } = summarizeAnswers([
      { question: '임신·수유', answer: '수유 중' },
      { question: '알레르기', answer: '있음 - 박하' },
    ]);
    expect(chips).toEqual([
      { label: '임신·수유', value: '수유 중', tone: 'warn' },
      { label: '알레르기', value: '박하', tone: 'warn' },
    ]);
  });

  it('구글폼처럼 질문 제목이 다르면 칩이 없다', () => {
    expect(summarizeAnswers([{ question: '불편하신 증상을 적어주세요', answer: '기침' }])).toEqual({ chips: [], note: '' });
  });
});

describe('summarizeAnswers - 대리 신청', () => {
  it('복용하실 분 번호가 있으면 복용자 칩에 같이 보여 준다', () => {
    const { chips } = summarizeAnswers([
      { question: '복용하실 분', answer: '부모님' },
      { question: '복용하실 분 번호', answer: '010-1111-2222' },
    ]);
    expect(chips).toEqual([{ label: '복용자', value: '부모님 · 010-1111-2222', tone: 'warn' }]);
  });
});

describe('shortSymptoms', () => {
  it('부위 이름을 떼고 증상만 남긴다', () => {
    expect(shortSymptoms('목 - 쉰 목소리, 목 - 잦은 헛기침')).toBe('쉰 목소리, 잦은 헛기침');
    expect(shortSymptoms('기침')).toBe('기침');
  });
});
