// 비대면진료 신청 카드 맨 위에 "한 줄 요약"으로 보여 줄 칩을 고르는 순수 함수.
// 웹페이지(보폐고 엔오 랜딩) 신청서의 질문 제목을 기준으로 전화할 때 바로 필요한 것(통화 시간·증상·기간·수량)과
// 주의할 것(임신·수유, 알레르기, 복용약, 본인 아닌 복용자)을 뽑는다. 구글폼처럼 제목이 다르면 칩이 없고, 화면은 예전처럼 전체 답을 펼쳐 보인다.

import type { AnswerItem } from './remoteConsult';

export type ChipTone = 'call' | 'main' | 'warn';

export interface SummaryChip {
  label: string;
  value: string;
  tone: ChipTone;
}

export interface RemoteSummary {
  chips: SummaryChip[];
  /** 환자가 직접 적은 추가 내용(있으면 요약 아래 한 줄로). */
  note: string;
}

const find = (answers: AnswerItem[], question: string) =>
  answers.find((a) => a.question.replace(/\s+/g, '') === question.replace(/\s+/g, ''))?.answer.trim() ?? '';

/** "코 - 코막힘, 기침 · 가래 - 오래가는 기침" → "코막힘, 오래가는 기침" */
export function shortSymptoms(text: string): string {
  return text
    .split(',')
    .map((s) => s.split(' - ').pop()!.trim())
    .filter(Boolean)
    .join(', ');
}

/** "3 (자주 불편)" → "자주 불편 3/5" */
function shortSeverity(text: string): string {
  const m = text.match(/^(\d)\s*\((.+)\)$/);
  return m ? `${m[2]} ${m[1]}/5` : text;
}

/** "2박스 (30일분, 300,000원)" → "2박스" */
function shortBox(text: string): string {
  return text.replace(/\s*\(.*\)\s*$/, '');
}

export function summarizeAnswers(answers: AnswerItem[]): RemoteSummary {
  const chips: SummaryChip[] = [];

  const call = find(answers, '통화 편한 시간대');
  if (call) chips.push({ label: '통화', value: call, tone: 'call' });

  const symptoms = find(answers, '증상');
  if (symptoms) chips.push({ label: '증상', value: shortSymptoms(symptoms), tone: 'main' });

  const period = [find(answers, '증상 기간'), shortSeverity(find(answers, '불편 정도'))].filter(Boolean).join(' · ');
  if (period) chips.push({ label: '기간', value: period, tone: 'main' });

  const box = find(answers, '생각하시는 수량');
  if (box) chips.push({ label: '수량', value: shortBox(box), tone: 'main' });

  const patient = find(answers, '복용하실 분');
  if (patient && patient !== '본인') chips.push({ label: '복용자', value: patient, tone: 'warn' });

  const pregnancy = find(answers, '임신·수유');
  if (pregnancy && pregnancy !== '해당 없음') chips.push({ label: '임신·수유', value: pregnancy, tone: 'warn' });

  const allergy = find(answers, '알레르기');
  if (allergy.startsWith('있음')) chips.push({ label: '알레르기', value: allergy.replace(/^있음\s*-\s*/, ''), tone: 'warn' });

  const meds = find(answers, '복용 중인 약');
  if (meds.startsWith('있음')) chips.push({ label: '복용약', value: meds.replace(/^있음\s*-\s*/, ''), tone: 'warn' });

  return { chips, note: find(answers, '추가로 알려주신 내용') };
}
