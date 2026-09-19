import type { DoctorName, Dose, DoseMode, Temperature } from "./types";

export const CLINIC = {
  name: "경희온담한의원",
  address: "경기도 수원시 영통구 영통로 118 델타빌딩 3층",
  phone: "031-205-0310",
  kakaoChatUrl: "http://pf.kakao.com/_QixblG/chat",
};

export const DOCTOR_NAMES: DoctorName[] = ["김동규", "박소은"];

export const TEMPERATURES: Temperature[] = [
  "따뜻하게",
  "미지근하게",
  "차게 또는 식혀서",
];

export const TIME_OF_DAY_PRESETS = ["아침", "점심", "저녁", "자기 전"];

export const TIME_ONLY_PRESETS = ["오전", "오후", "저녁"];

export const FOOD_RESTRICTION_OPTIONS = [
  "찬 음식",
  "밀가루 음식",
  "설탕",
  "커피",
  "매운 음식",
  "돼지고기",
  "닭고기",
  "튀김",
  "술",
  "담배",
  "홍차",
  "라면",
];

// 체크된 금지 음식에 붙는 한의학적 근거. 같은 이유를 공유하는 음식은 한 그룹으로 묶어 안내한다.
export const FOOD_REASON_GROUPS: { foods: string[]; reason: string }[] = [
  { foods: ["찬 음식"], reason: "몸을 차게 만듭니다." },
  {
    foods: ["밀가루 음식", "설탕", "튀김", "라면"],
    reason: "몸에 담음(불순물, 노폐물)을 만들어냅니다.",
  },
  {
    foods: ["커피", "홍차"],
    reason: "카페인이 교감신경을 항진시키고 체액을 소모시킵니다.",
  },
  { foods: ["매운 음식"], reason: "과하게 드시면 체액을 소모시킵니다." },
  { foods: ["돼지고기"], reason: "기름기가 많아 소화에 방해가 됩니다." },
  { foods: ["닭고기"], reason: "허열을 뜨게 합니다." },
];

export const DEFAULT_STORAGE_NOTE =
  "약은 냉장실에 보관해 주시고, 특히 여름철에는 반드시 냉장 보관해 주세요. 드시는 중 침전물이 보이더라도 이상이 있는 것이 아니니 안심하고 드셔도 됩니다.";

export const DEFAULT_ETC_NOTE =
  "복용 중에는 무리한 운동은 피하시고 충분히 쉬시길 바랍니다. 문의사항이 있으시면 전화 주시거나, QR코드로 카카오톡 상담 부탁드립니다.";

export function defaultDoses(count: 2 | 3, mode: DoseMode = "meal"): Dose[] {
  if (mode === "timeOnly") {
    const times = count === 2 ? ["오전", "오후"] : ["오전", "오후", "저녁"];
    return times.map((time) => ({ time, beforeAfter: "식후", minutes: "" }));
  }
  const presets: Dose[] =
    count === 2
      ? [
          { time: "아침", beforeAfter: "식후", minutes: "30" },
          { time: "저녁", beforeAfter: "식전", minutes: "30" },
        ]
      : [
          { time: "아침", beforeAfter: "식후", minutes: "30" },
          { time: "점심", beforeAfter: "식후", minutes: "30" },
          { time: "저녁", beforeAfter: "식후", minutes: "30" },
        ];
  return presets;
}
