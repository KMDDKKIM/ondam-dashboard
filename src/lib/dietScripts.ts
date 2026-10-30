// 원장이 린다이어트 환자에게 보내는 카톡 문구 틀(온유한의원 사례 문서의 스크립트). {칸}은 아는 값만 자동으로 채우고,
// 모르는 칸은 {단계}처럼 그대로 남겨 원장이 고쳐 쓴다. 환자 정보는 화면 안에서만 채우고 외부로 나가지 않는다.

import { addDaysKst, weekdayKo } from './kst';
import { deskCodeFromNote, holidayClusters, type DeskCallCode, type DietProgram, type OwnerMessageCode } from './dietProgram';

export const OWNER_SCRIPTS: Record<OwnerMessageCode, string> = {
  'pill-start': '{이름}님 {원장명} 원장입니다☺️ 어제까지 디톡스 진행하셨지요? 오늘부터 다이어트환 복용일이신데, 컨디션 좀 어떠셔요~?\n\n디톡스 이후 안내 드릴게요!\n\n1. 빠졌던 수분이 돌아와 체중이 조금 늘 수 있어요. 2-3일 내로 다시 내려갑니다.\n2. 디톡스환 성분이 아직 남아 2-3일간 복통·무른 변이 있을 수 있어요. 곧 괜찮아집니다.\n3. 이제 1주일에 0.5-1kg씩, 12주면 6-12kg 빠지게 됩니다.\n\n식단은 이렇게 👍\n\n채소 먼저 (방울토마토가 제일 만만해요) → 위장에 당 흡수 막는 보호벽이 생깁니다.\n그다음 단백질: 고기(구이·수육) 계란 2개 두부 반 모 생선 한 토막. 매끼 꼭.\n마지막 탄수화물: 면·빵·떡 피하고 현미밥 1/3공기. 배부르면 생략.\n\n이렇게 드시면 감량은 물론 컨디션·체력·기분까지 좋아집니다 😁',
  'visit-revisit': '{이름}님 {원장명} 원장입니다. 오늘 상담한 대로 다음은 {단계}로 올려서 드렸으니, 내일 아침부터 새 약으로 시작하시면 됩니다.\n다음 재진은 {다음재진일}이에요. 그 전까지 기록 꾸준히 부탁드려요☺️',
  'remote-second': '{이름}님 {원장명} 원장입니다.\n\n1. 다음은 {단계}로 올려서 {기간} 처방합니다.\n2. 결제 링크는 코디가 바로 보내드릴게요.\n3. 주소 확인 부탁드려요~!\n{저장주소}\n4. 다음 상담은 {다음상담일}에 전화드릴게요.',
  'remote-nudge': '{이름}님 {원장명} 원장입니다. 오늘 많이 바쁘신가보네요. 다음 약 처방 보내드려야 할텐데 약 충분히 있으신가요?',
  'pill-day1': '{이름}님 {원장명} 원장입니다. 어제 첫날 복통이나 수면은 어떠셨나요?\n내일까지는 복통·가스·무른 변이 있을 수 있으니 놀라지 마시고 다이어트환 쭉 복용하시면 됩니다.',
  'pill-daily': '{이름}님 {원장명} 원장입니다☺️ 다이어트환 드시고 계신데 오늘 컨디션은 어떠세요? 복통이나 무른 변, 수면은 괜찮으신가요? 식단은 채소 → 단백질 → 탄수화물 순서로 꼭 지켜주세요👍\n불편한 점 있으면 편하게 말씀 주세요.',
  weekly: '안녕하세요 {이름}님 {원장명} 원장입니다☺️ 주말 잘 보내셨어요? 주말은 식사 조절이 좀 쉽진 않죠? 오늘부터 딱 다시 잘 하면 주말에 오른 건 금방 내리고 감량도 마저 할 수 있습니다!',
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

// ---- 데스크(코디) 해피콜 문구 ----
// 해피콜 목록의 린다이어트 해피콜에서 "문구 복사"로 가져간다. {이름}·{코디명}은 자동으로 채우고 나머지 {칸}은 직접 채운다.
// 디톡스 시작일 문구는 온유한의원 사례의 "디톡스 복용법" 안내를 쓰고, 2·3일차 문구는 그 사례에 없어서 새로 썼다(직접 고쳐 쓰세요).

export const DESK_SCRIPTS: Record<DeskCallCode, string> = {
  'detox-day1':
    '{이름}님!\n오늘 저녁부터 디톡스 화이팅입니다 😁💪🏻\n\n1️⃣ 오늘 저녁 식사 후 8시에 {디톡스환} 1포. 내일은 기상 직후 1포, 이후 3시간 간격 1포씩 하루 총 3포.\n\n2️⃣ 내일 아침부터 금식. 허기가 심하면 사골국물에 소금·후추 간해서 드세요. 칼로리는 거의 없고 미네랄은 많아 든든합니다.\n\n3️⃣ 금식 중엔 물 자주, 가능하면 레몬수 👍\n\n★복통이 너무 심하면 복용을 중단하셔도 됩니다.\n\n화이팅!! 성공하실 수 있습니다💪🏻\n궁금한 건 언제든 연락주시고, 매일 아침 공복체중·식사·복약 기록 잊지마세요!!\n❤{앱명} {앱링크}',
  'detox-day2':
    '{이름}님, 안녕하세요~ 코디 {코디명}입니다🤗\n디톡스 둘째 날이네요! 컨디션은 좀 어떠세요?\n\n복통이나 어지러움, 두통이 있으면 편하게 말씀해 주세요. 물은 자주 드시고, 허기가 심하면 사골국물에 소금 간해서 드셔도 괜찮아요 😊\n\n오늘도 아침 공복체중과 복약 기록 잊지 마세요!',
  'reservation-reminder':
    '안녕하세요 {이름}님🥰 내일 {예약일시} 예약 잊지 않으셨죠?\n앱 기록이 잘 올라가 있으면 원장님 상담이 훨씬 수월합니다! 조심히 오세요 😊',
  'detox-day3':
    '{이름}님, 코디 {코디명}입니다🤗\n오늘이 디톡스 마지막 날이에요, 정말 고생 많으셨어요! 💪🏻\n\n컨디션은 어떠세요? 불편한 곳 있으면 말씀해 주세요.\n내일부터 다이어트환 복용이 시작되는데, 시작일에 원장님이 직접 안부 연락드릴 예정이에요 😊',
};

/** 해피콜 목록의 린다이어트 해피콜 문구(note)에 맞는 카톡 문구 틀(린다이어트 해피콜이 아니면 null). */
export function deskScriptForNote(note: string | null | undefined): string | null {
  const code = deskCodeFromNote(note);
  return code ? DESK_SCRIPTS[code] : null;
}

/** 해피콜 목록에서 복사할 문구 — 이름·코디명·월을 채운다. */
export function deskScriptText(note: string | null | undefined, patientName: string, staffName: string, today: string): string | null {
  const template = deskScriptForNote(note);
  if (template == null) return null;
  const month = Number(today.slice(5, 7));
  // 예약 리마인드의 문구 끝 "(10/23 14:30)"에서 예약 날짜·시간을 읽어 {예약일시}를 채운다.
  const when = (note ?? '').match(/\((\d{1,2})\/(\d{1,2})\s*([^)]*)\)\s*$/);
  const reservation = when ? `${Number(when[1])}월 ${Number(when[2])}일${when[3].trim() ? ` ${when[3].trim()}` : ''}` : undefined;
  return fillScript(template, { 이름: patientName, 코디명: staffName, 월: String(month), 전월: String(month === 1 ? 12 : month - 1), 예약일시: reservation });
}
