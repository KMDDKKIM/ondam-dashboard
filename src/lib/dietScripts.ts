// 원장이 린다이어트 환자에게 보내는 카톡 문구 틀(온유한의원 사례 문서의 스크립트). {칸}은 아는 값만 자동으로 채우고,
// 모르는 칸은 {단계}처럼 그대로 남겨 원장이 고쳐 쓴다. 환자 정보는 화면 안에서만 채우고 외부로 나가지 않는다.

import { addDaysKst, weekdayKo } from './kst';
import { holidayClusters, type DietProgram, type OwnerMessageCode } from './dietProgram';

export const OWNER_SCRIPTS: Record<OwnerMessageCode, string> = {
  'visit-revisit': '{이름}님 {원장명} 원장입니다. 오늘 상담한 대로 다음은 {단계}로 올려서 드렸으니, 내일 아침부터 새 약으로 시작하시면 됩니다.\n다음 재진은 {다음재진일}이에요. 그 전까지 기록 꾸준히 부탁드려요☺️',
  'remote-second': '{이름}님 {원장명} 원장입니다.\n\n1. 다음은 {단계}로 올려서 {기간} 처방합니다.\n2. 결제 링크는 코디가 바로 보내드릴게요.\n3. 주소 확인 부탁드려요~!\n{저장주소}\n4. 다음 상담은 {다음상담일}에 전화드릴게요.',
  'remote-nudge': '{이름}님 {원장명} 원장입니다. 오늘 많이 바쁘신가보네요. 다음 약 처방 보내드려야 할텐데 약 충분히 있으신가요?',
  'pill-day1': '{이름}님 {원장명} 원장입니다. 어제 첫날 복통이나 수면은 어떠셨나요?\n내일까지는 복통·가스·무른 변이 있을 수 있으니 놀라지 마시고 다이어트환 쭉 복용하시면 됩니다.',
  checkin: '{이름}님 {원장명} 원장입니다☺️ 기록 잘 올려주고 계시네요. 오늘은 좀 잘 주무셨는지요? 식사에서 밥은 절반 정도 드시나요?',
  weekly: '안녕하세요 {이름}님 {원장명} 원장입니다☺️ 주말 잘 보내셨어요? 주말은 식사 조절이 좀 쉽진 않죠? 오늘부터 딱 다시 잘 하면 주말에 오른 건 금방 내리고 감량도 마저 할 수 있습니다!',
  'no-record': '{이름}님 안녕하세요 {원장명} 원장입니다. 이번주는 기록을 못하고 계신데 별일 없으신가요?',
  refill: '{이름}님 {원장명} 원장입니다. 약이 며칠 안 남으셨죠? 이번 분량 이후에도 감량 더 이어서 하실 거죠? ☺️',
  holiday: '안녕하세요. {원장명} 원장입니다.\n\n경희온담한의원은 {연휴명} {휴무기간} 쉬고 {진료재개일}부터 정상 진료합니다.\n\n즐거운 {연휴명} 되시길 바라며, 명절에 살이 너무 찌지 않기 위한 주의 사항을 영상으로 전합니다.\n{영상링크}',
};

/** {칸}을 값으로 바꾼다. 값이 없는 칸은 그대로 둔다(원장이 직접 채운다). */
export function fillScript(template: string, values: Record<string, string | undefined>): string {
  return template.replace(/\{([^{}]+)\}/g, (whole, key: string) => {
    const v = values[key];
    return v != null && v !== '' ? v : whole;
  });
}

/** "2026-10-22" → "10월 22일(수)" */
export function koDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일(${weekdayKo(date)})`;
}

function holidayName(start: string): string {
  const month = Number(start.slice(5, 7));
  return month <= 2 ? '설 연휴' : '추석 연휴';
}

/** 그 환자·메시지에 채울 수 있는 값들. dueDate는 보내기로 한 날(연휴 공지에서 어느 연휴인지 찾는 데 쓴다). */
export function scriptValues(p: DietProgram, code: OwnerMessageCode, doctorName: string, dueDate: string): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = { 이름: p.patientName, 원장명: doctorName };
  // 다음 재진·상담 일정, 단계, 기간, 주소, 영상 링크는 원장이 정하는 값이라 비워 둔다(문구에 {칸}으로 남는다).
  if (code === 'holiday') {
    const cluster = holidayClusters().find((c) => addDaysKst(c.start, -1) === dueDate);
    if (cluster) {
      values.연휴명 = holidayName(cluster.start);
      values.휴무기간 = cluster.start === cluster.end ? koDate(cluster.start) : `${koDate(cluster.start)}~${koDate(cluster.end)}`;
      values.진료재개일 = koDate(addDaysKst(cluster.end, 1));
    }
  }
  return values;
}
