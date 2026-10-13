import { TEMPERATURES } from "./constants";
import type { Temperature } from "./types";

// 복용 온도는 여러 개를 고를 수 있다(원장 요청, 2026-10-13 — "따뜻하게 혹은 미지근하게"도 괜찮은 분이 있다).
// DB 의 temperature 칸은 글자 하나라서, 고른 것들을 쉼표로 이어 한 칸에 넣는다(예전 기록의 한 가지 값도 그대로 읽힌다).

const DEFAULT: Temperature = "따뜻하게";

/** 저장된 글자("따뜻하게,미지근하게" 또는 옛 기록의 "따뜻하게")를 목록으로. 알 수 없는 값은 버리고, 비면 기본값. */
export function parseTemperatures(raw: string | null | undefined): Temperature[] {
  const parts = (raw ?? "").split(",").map((p) => p.trim());
  const picked = TEMPERATURES.filter((t) => parts.includes(t));
  return picked.length > 0 ? picked : [DEFAULT];
}

export function serializeTemperatures(list: Temperature[]): string {
  return TEMPERATURES.filter((t) => list.includes(t)).join(",");
}

/** 버튼을 눌렀을 때의 다음 선택. 누른 것이 켜져 있으면 끄고(단, 마지막 하나는 못 끈다), 꺼져 있으면 켠다. 항상 TEMPERATURES 순서. */
export function toggleTemperature(current: Temperature[], t: Temperature): Temperature[] {
  const on = current.includes(t);
  if (on && current.length <= 1) return current;
  const next = on ? current.filter((x) => x !== t) : [...current, t];
  return TEMPERATURES.filter((x) => next.includes(x));
}

/** 안내문에 넣을 말 — "따뜻하게" / "따뜻하게 또는 미지근하게" / "따뜻하게, 미지근하게, 차게 또는 식혀서". */
export function formatTemperatures(list: Temperature[]): string {
  const ordered = TEMPERATURES.filter((t) => list.includes(t));
  if (ordered.length === 0) return DEFAULT;
  if (ordered.length === 1) return ordered[0];
  if (ordered.length === 2) return `${ordered[0]} 또는 ${ordered[1]}`;
  return ordered.join(", ");
}
