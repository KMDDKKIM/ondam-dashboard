// 원장이 린다이어트 환자에게 보내는 카톡 문구 틀(온유한의원 사례 문서의 스크립트). {칸}은 아는 값만 자동으로 채우고,
// 모르는 칸은 {단계}처럼 그대로 남겨 원장이 고쳐 쓴다. 환자 정보는 화면 안에서만 채우고 외부로 나가지 않는다.

import { addDaysKst, weekdayKo } from './kst';
import { DESK_NOTE_PREFIX, deskCallLabel, deskCodeFromNote, holidayClusters, type DeskCallCode, type DietProgram, type DietTrack, type OwnerMessageCode } from './dietProgram';

export const OWNER_SCRIPTS: Record<OwnerMessageCode, string> = {
  'visit-revisit': '{이름}님 {원장명} 원장입니다. 오늘 상담한 대로 다음은 {단계}로 올려서 드렸으니, 내일 아침부터 새 약으로 시작하시면 됩니다.\n다음 재진은 {다음재진일}이에요. 그 전까지 기록 꾸준히 부탁드려요☺️',
  'remote-second': '{이름}님 {원장명} 원장입니다.\n\n1. 다음은 {단계}로 올려서 {기간} 처방합니다.\n2. 결제 링크는 코디가 바로 보내드릴게요.\n3. 주소 확인 부탁드려요~!\n{저장주소}\n4. 다음 상담은 {다음상담일}에 전화드릴게요.',
  'remote-nudge': '{이름}님 {원장명} 원장입니다. 오늘 많이 바쁘신가보네요. 다음 약 처방 보내드려야 할텐데 약 충분히 있으신가요?',
  'pill-day1': '{이름}님 {원장명} 원장입니다. 어제 첫날 복통이나 수면은 어떠셨나요?\n내일까지는 복통·가스·무른 변이 있을 수 있으니 놀라지 마시고 다이어트환 쭉 복용하시면 됩니다.',
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
// 해피콜 목록의 린다이어트 해피콜에서 "문구 복사"로 가져간다. {이름}·{코디명}·{월}·{전월}은 자동으로 채우고 나머지 {칸}은 직접 채운다.

const REVIEW_AND_APP = [
  "다이어트 시작 전 각오를 다지는 의미로 구글에 리뷰를 작성해주시면 {선물명}을 1박스 선물로 보내드릴 수 있는데 작성해주실거죠?",
  '',
  '{리뷰링크}',
  "▲ '경희온담한의원' 검색 후 작성 부탁드려요 😍",
  '',
  '1️⃣ 성별·연령대 / 왜 다이어트를 시작하셨는지',
  '2️⃣ 현재 몸무게와 목표 몸무게 (앞으로 ○kg 감량이 목표! 도 OK)',
  '3️⃣ 열심히 해보겠다는 다짐',
  '',
  '작성 후 캡쳐본을 이쪽으로 꼭 보내주세요 😁💕',
  '',
  '그리고 매일 아침 공복체중·식사·복약 기록을 꼭 남겨주셔야 합니다.',
  '',
  '❤{앱명} 설치↓',
  '{앱링크}',
  '',
  '복용 시작 전에도 기록은 남길 수 있으니 오늘부터 바로 부탁드려요 🙏',
].join('\n');

export const DESK_SCRIPTS: Record<DeskCallCode, { visit: string; remote: string }> = (() => {
  const same = (t: string) => ({ visit: t, remote: t });
  return {
    'consult-done': {
      visit: '{이름}님, 오늘 내원해주셔서 감사합니다😊\n앞으로 {프로그램명} {기간} 함께 진행하기로 하셨고요, 1:1 케어는 이 채널로 드릴 예정이니 채널 추가 부탁드립니다🙏\n\n한약은 {당일 수령하셨으니 / 오늘 중 택배 발송 예정이니} 디톡스 시작 전날 저녁에 복용법 다시 안내드릴게요!',
      remote: '😊 {이름}님! 원장님과 상담은 잘 하셨을까요?\n\n상담 내용 정리해드릴게요.\n- 처방 한약 : {프로그램명} {기간}\n- 구성 : {구성}\n- 복용 순서 : 디톡스 {디톡스일수}일 → 다이어트환 시작\n- 처방 비용 : {금액}만원\n\n결제는 아래 링크로 부탁드립니다 (카드·계좌이체 모두 가능)\n💳 {결제링크}\n\n결제 확인되면 오늘 중 발송해드려요!',
    },
    paid: {
      visit: REVIEW_AND_APP,
      remote: '결제 확인되었습니다 감사합니다😊\n배송받으실 주소와 연락처 한 번 더 확인 부탁드릴게요!\n{저장주소}\n\n' + REVIEW_AND_APP,
    },
    shipped: same('안녕하세요 {이름}님😊 경희온담한의원입니다.\n한약을 오늘 택배로 발송 완료했습니다.\n\n[송장번호 : {택배사} {송장번호}]\n\n내일 도착 예상이며 택배사 사정에 따라 지연될 수 있는 점 양해 부탁드릴게요🙂'),
    received: same('{이름}님, 한약 잘 받으셨나요? 📦\n박스 안에 {디톡스환}({디톡스색})과 {다이어트환}({다이어트색})이 들어있어요.\n\n디톡스는 {디톡스시작일} 저녁부터 시작이에요. 시작 전날 저녁에 복용법 다시 안내드릴게요!\n시작일 바꾸고 싶으시면 말씀주세요 😊'),
    'detox-eve': same('{이름}님!\n오늘 저녁부터 디톡스 화이팅입니다 😁💪🏻\n\n1️⃣ 오늘 저녁 식사 후 8시에 {디톡스환} 1포. 내일은 기상 직후 1포, 이후 3시간 간격 1포씩 하루 총 3포.\n\n2️⃣ 내일 아침부터 금식. 허기가 심하면 사골국물에 소금·후추 간해서 드세요. 칼로리는 거의 없고 미네랄은 많아 든든합니다.\n\n3️⃣ 금식 중엔 물 자주, 가능하면 레몬수 👍\n\n★복통이 너무 심하면 복용을 중단하셔도 됩니다.\n\n화이팅!! 성공하실 수 있습니다💪🏻\n궁금한 건 언제든 연락주시고, 매일 아침 공복체중·식사·복약 기록 잊지마세요!!\n❤{앱명} {앱링크}'),
    'pill-start': same('어제까지 디톡스 진행하셨지요? 오늘부터 다이어트 복용일이신데, 컨디션 좀 어떠셔요~? ☺️\n\n디톡스 이후 안내 드릴게요!\n\n1. 빠졌던 수분이 돌아와 체중이 조금 늘 수 있어요. 2-3일 내로 다시 내려갑니다.\n2. {디톡스환} 성분이 아직 남아 2-3일간 복통·무른 변이 있을 수 있어요. 곧 괜찮아집니다.\n3. 이제 1주일에 0.5-1kg씩, 12주면 6-12kg 빠지게 됩니다.\n\n식단은 이렇게 👍\n\n채소 먼저 (방울토마토가 제일 만만해요) → 위장에 당 흡수 막는 보호벽이 생깁니다.\n그다음 단백질: 고기(구이·수육) 계란 2개 두부 반 모 생선 한 토막. 매끼 꼭.\n마지막 탄수화물: 면·빵·떡 피하고 현미밥 1/3공기. 배부르면 생략.\n\n이렇게 드시면 감량은 물론 컨디션·체력·기분까지 좋아집니다 😁'),
    monthly: same('안녕하세요 {이름}님~ 코디 {코디명}입니다🤗\n어느새 {월}월이네요! {전월}월 한 달도 고생 많으셨습니다 ㅎㅎ\n컨디션은 좀 어떠신가요~?'),
    reorder: {
      visit: '{이름}님~ 안녕하세요 🤗 코디 {코디명}입니다!\n약이 열흘 정도 남으셨을 텐데요, 원장님께서 경과 확인 후 다음 단계 처방을 잡아주시려고 해요.\n\n내원 가능하신 날짜·시간 2개 정도 말씀주시면 예약 잡아드릴게요! 😉\n(내원이 어려우시면 전화상담으로도 가능합니다)',
      remote: '{이름}님~ 안녕하세요 🤗 코디 {코디명}입니다!\n약이 열흘 정도 남으셨을 텐데요, 원장님께서 경과 확인 전화 후 다음 단계 처방을 보내드리려고 해요.\n\n통화 편하신 시간 2개 정도 말씀주시면 맞춰서 연락드릴게요! 😉',
    },
    finish: same('안녕하세요 {이름}님, 코디 {코디명}입니다. 🤗\n프로그램을 마치기까지 정말 고생 많으셨습니다.\n\n이후에는 식사량을 기존보다 20~30% 늘리시고, 체중 매일 재는 습관을 유지해주세요!\n저희가 종종 안부 여쭙겠습니다 ㅎㅎ\n\n리뷰 작성도 부탁드릴게요 😊 감사의 의미로 {선물명}을 보내드립니다👍\n\n네이버 리뷰 방법\n1️⃣ {네이버예약링크}에서 예약 접수 → 저희가 내원 인증 처리\n2️⃣ 플레이스에 후기 작성. 앱 감량 그래프 캡쳐 첨부, \'한약\' 단어 포함\n3️⃣ 작성 캡쳐 + 선물 받으실 주소를 이쪽으로 보내주세요 😍'),
  };
})();

/** 해피콜 목록의 린다이어트 해피콜 문구(note)에 맞는 카톡 문구 틀. 대면/비대면 구분은 문구 안의 라벨로 알아낸다. */
export function deskScriptForNote(note: string | null | undefined): string | null {
  const code = deskCodeFromNote(note);
  if (!code || !note) return null;
  const label = note.slice(DESK_NOTE_PREFIX.length).trim();
  const track: DietTrack = deskCallLabel(code, 'visit') === label ? 'visit' : 'remote';
  return DESK_SCRIPTS[code][track];
}

/** 해피콜 목록에서 복사할 문구 — 이름·코디명·월을 채운다. */
export function deskScriptText(note: string | null | undefined, patientName: string, staffName: string, today: string): string | null {
  const template = deskScriptForNote(note);
  if (template == null) return null;
  const month = Number(today.slice(5, 7));
  return fillScript(template, { 이름: patientName, 코디명: staffName, 월: String(month), 전월: String(month === 1 ? 12 : month - 1) });
}
