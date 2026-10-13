import { describe, expect, it } from "vitest";
import { herbPrintHref } from "./handoff";

describe("herbPrintHref", () => {
  it("환자 성함과 하루 2·3회를 실어 보낸다(성함은 주소용으로 변환)", () => {
    const url = new URL(herbPrintHref(" 가나다 ", 3), "https://example.test");
    expect(url.pathname).toBe("/herb-print");
    expect(url.searchParams.get("patientName")).toBe("가나다");
    expect(url.searchParams.get("dosesPerDay")).toBe("3");
  });

  it("복용 횟수가 2·3회가 아니면(0·1·4회 등) 횟수는 싣지 않는다", () => {
    for (const n of [0, 1, 4]) expect(new URL(herbPrintHref("가나다", n), "https://example.test").searchParams.has("dosesPerDay")).toBe(false);
  });
});
