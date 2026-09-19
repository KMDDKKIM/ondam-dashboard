import { CLINIC, FOOD_REASON_GROUPS } from "./constants";
import { josaEunNeun, josaEuroRo, josaGwaWa } from "./josa";
import type { Prescription } from "./types";

export function formatKoreanDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export interface Segment {
  text: string;
  bold?: boolean;
}

function seg(text: string, bold = false): Segment {
  return { text, bold };
}

function formatDoseList(p: Prescription): string {
  const times = p.doses.map((d) => d.time.trim()).filter(Boolean);

  if (p.doseMode === "timeOnly") {
    return joinWithGwaWa(times);
  }

  const parts = p.doses
    .filter((d) => d.time.trim())
    .map((d) => {
      const minutes = d.minutes.trim();
      const timing = minutes
        ? `${d.time} ${d.beforeAfter} ${minutes}분`
        : `${d.time} ${d.beforeAfter}`;
      return timing;
    });
  return joinWithGwaWa(parts);
}

function joinWithGwaWa(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  const head = parts.slice(0, -1).join(", ");
  return `${head}${josaGwaWa(head)} ${parts[parts.length - 1]}`;
}

function buildFoodSegments(p: Prescription): Segment[] {
  const checked = new Set(p.restrictedFoods);
  const otherItems = p.restrictedFoodsOther
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const clauses: Segment[] = [];
  const usedFoods = new Set<string>();

  for (const group of FOOD_REASON_GROUPS) {
    const matched = group.foods.filter((f) => checked.has(f));
    if (matched.length === 0) continue;
    matched.forEach((f) => usedFoods.add(f));
    const label = matched.join(", ");
    if (clauses.length > 0) clauses.push(seg(" "));
    clauses.push(seg(label, true));
    clauses.push(seg(`${josaEunNeun(label)} ${group.reason}`));
  }

  const leftover = [...p.restrictedFoods.filter((f) => !usedFoods.has(f)), ...otherItems];
  if (leftover.length > 0) {
    const label = leftover.join(", ");
    if (clauses.length > 0) clauses.push(seg(" "));
    clauses.push(seg(label, true));
    clauses.push(seg(`${josaEunNeun(label)} 복용 기간 동안 삼가주시면 좋겠습니다.`));
  }

  if (clauses.length === 0) {
    return [
      seg(
        "복용 기간 중 특별히 가려야 할 음식은 없으나, 소화가 잘 되는 음식 위주로 드시면 더욱 좋습니다.",
      ),
    ];
  }

  return [
    seg("약효가 잘 스며들 수 있도록 아래 음식은 주의해 주시면 좋겠습니다. "),
    ...clauses,
    seg(" 말씀드린 음식들은 복용 기간 동안 최대한 드시지 않도록 부탁드립니다."),
  ];
}

export interface LetterParagraphs {
  greeting: string;
  intro: Segment[];
  dosage: Segment[];
  foodNote: Segment[];
  storageNote: string;
  etcNote: string;
  personalNote: string;
  closing: string;
  signatureLine: string;
  dateLine: string;
}

export function buildLetter(p: Prescription): LetterParagraphs {
  const nameHonor = p.patientName.trim() ? `${p.patientName.trim()} 님` : "환자분";
  const greeting = `${nameHonor}께`;

  const complaint = p.chiefComplaint.trim();
  const intro: Segment[] = complaint
    ? [
        seg(`안녕하세요, ${CLINIC.name} ${p.doctorName} 원장입니다. `),
        seg(complaint, true),
        seg(
          `${josaEuroRo(complaint)} 불편하셨던 점이 나아지실 수 있도록 정성껏 처방을 지어드렸습니다.`,
        ),
      ]
    : [
        seg(
          `안녕하세요, ${CLINIC.name} ${p.doctorName} 원장입니다. 회복에 도움이 되시도록 정성껏 처방을 지어드렸습니다.`,
        ),
      ];

  const doseCountText = `하루 ${p.dosesPerDay}회`;
  const doseList = formatDoseList(p);
  const dosage: Segment[] =
    p.doseMode === "timeOnly"
      ? [
          seg("이 약은 "),
          seg(doseCountText, true),
          seg(", 식사 시간과 관계없이 "),
          ...(doseList ? [seg(doseList, true), seg("에 각 한 포씩, ")] : [seg("각 한 포씩 ")]),
          seg(p.temperature),
          seg(" 드시기 바랍니다."),
        ]
      : [
          seg("이 약은 "),
          seg(doseCountText, true),
          seg(", "),
          ...(doseList ? [seg(doseList, true), seg("에 한 포씩, ")] : [seg("한 포씩 ")]),
          seg(p.temperature),
          seg(" 드시기 바랍니다."),
        ];

  const foodNote = buildFoodSegments(p);

  const closing = `${nameHonor}의 회복을 진심으로 응원합니다.`;

  const dateLine = p.brewDate ? `탕전날짜 : ${formatKoreanDate(p.brewDate)}` : "";

  const signatureLine = `${CLINIC.name} 원장 ${p.doctorName} 드림`;

  return {
    greeting,
    intro,
    dosage,
    foodNote,
    storageNote: p.storageNote,
    etcNote: p.etcNote,
    personalNote: p.personalNote.trim(),
    closing,
    signatureLine,
    dateLine,
  };
}
