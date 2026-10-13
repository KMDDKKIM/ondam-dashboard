import { describe, expect, it } from "vitest";
import { buildLetter } from "./letterText";
import { makeEmptyPrescription } from "./defaults";
import { formatTemperatures, parseTemperatures, serializeTemperatures, toggleTemperature } from "./temperature";

describe("parseTemperatures · serializeTemperatures", () => {
  it("여러 개를 쉼표로 저장하고 다시 읽는다(항상 같은 순서)", () => {
    expect(serializeTemperatures(["미지근하게", "따뜻하게"])).toBe("따뜻하게,미지근하게");
    expect(parseTemperatures("따뜻하게,미지근하게")).toEqual(["따뜻하게", "미지근하게"]);
  });

  it("예전 기록의 한 가지 값도 읽힌다", () => {
    expect(parseTemperatures("차게 또는 식혀서")).toEqual(["차게 또는 식혀서"]);
  });

  it("비었거나 알 수 없는 값이면 기본(따뜻하게)", () => {
    expect(parseTemperatures("")).toEqual(["따뜻하게"]);
    expect(parseTemperatures(null)).toEqual(["따뜻하게"]);
    expect(parseTemperatures("뜨겁게")).toEqual(["따뜻하게"]);
  });
});

describe("toggleTemperature", () => {
  it("켜고 끈다", () => {
    expect(toggleTemperature(["따뜻하게"], "미지근하게")).toEqual(["따뜻하게", "미지근하게"]);
    expect(toggleTemperature(["따뜻하게", "미지근하게"], "따뜻하게")).toEqual(["미지근하게"]);
  });

  it("마지막 하나는 끌 수 없다", () => {
    expect(toggleTemperature(["미지근하게"], "미지근하게")).toEqual(["미지근하게"]);
  });

  it("누른 순서와 상관없이 정해진 순서로 둔다", () => {
    expect(toggleTemperature(["차게 또는 식혀서"], "따뜻하게")).toEqual(["따뜻하게", "차게 또는 식혀서"]);
  });
});

describe("formatTemperatures", () => {
  it("하나·둘·셋을 자연스러운 말로", () => {
    expect(formatTemperatures(["따뜻하게"])).toBe("따뜻하게");
    expect(formatTemperatures(["따뜻하게", "미지근하게"])).toBe("따뜻하게 또는 미지근하게");
    expect(formatTemperatures(["따뜻하게", "미지근하게", "차게 또는 식혀서"])).toBe("따뜻하게, 미지근하게, 차게 또는 식혀서");
  });
});

describe("안내문", () => {
  it("복용 온도가 둘이면 문장에 \"따뜻하게 또는 미지근하게\"가 들어간다", () => {
    const p = { ...makeEmptyPrescription(), patientName: "가나다", temperatures: ["따뜻하게", "미지근하게"] as ("따뜻하게" | "미지근하게")[] };
    const text = buildLetter(p).dosage.map((s) => s.text).join("");
    expect(text).toContain("따뜻하게 또는 미지근하게 드시기 바랍니다.");
  });
});
