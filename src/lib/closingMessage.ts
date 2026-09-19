// 데스크가 원장에게 매일 보내는 마무리 멘트를 입력값으로 만들어 준다.
// 예) 금일환자수 : 34명(제외환자:박혜진님) / 예약 환자 수 21명 / 추나 7명 (조현지님,변경은님) /
//     일반한약15일 1명,녹용한약 1명 / 네이버리뷰 1명 / 초진 2명,소개환 1명(임수진님) / 고생하셨습니다

export interface ClosingMessageInput {
  visitCount: number | null; // 금일환자수(결산표 내원환자수)
  excludedNames: string; // 제외환자 이름(쉼표/띄어쓰기로 구분)
  reservationCount: number | null; // 예약 환자 수
  chunaCount: number | null; // 추나 인원 — 비어 있으면 이름 개수로 센다
  chunaNames: string;
  herbSales: string; // "일반한약15일 1명,녹용한약 1명" 처럼 이미 완성된 글
  naverReviewCount: number | null;
  firstVisitCount: number | null; // 초진
  referralCount: number | null; // 소개환
  referralNames: string;
}

export function splitNames(text: string): string[] {
  return text
    .split(/[,，、\s]+/)
    .map((n) => n.trim())
    .filter(Boolean);
}

// 이름 뒤에 "님"이 없으면 붙여서 "조현지님,변경은님" 형태로 만든다.
export function formatNames(text: string): string {
  return splitNames(text)
    .map((n) => (n.endsWith('님') ? n : `${n}님`))
    .join(',');
}

export function buildClosingMessage(input: ClosingMessageInput): string {
  const parts: string[] = [];

  const excluded = formatNames(input.excludedNames);
  parts.push(`금일환자수 : ${input.visitCount ?? 0}명${excluded ? `(제외환자:${excluded})` : ''}`);
  parts.push(`예약 환자 수 ${input.reservationCount ?? 0}명`);

  const chunaNames = formatNames(input.chunaNames);
  const chunaCount = input.chunaCount ?? splitNames(input.chunaNames).length;
  parts.push(`추나 ${chunaCount}명${chunaNames ? ` (${chunaNames})` : ''}`);

  if (input.herbSales.trim()) parts.push(input.herbSales.trim());

  if (input.naverReviewCount) parts.push(`네이버리뷰 ${input.naverReviewCount}명`);

  const visitParts: string[] = [];
  if (input.firstVisitCount) visitParts.push(`초진 ${input.firstVisitCount}명`);
  const referralNames = formatNames(input.referralNames);
  const referralCount = input.referralCount ?? splitNames(input.referralNames).length;
  if (referralCount) visitParts.push(`소개환 ${referralCount}명${referralNames ? `(${referralNames})` : ''}`);
  if (visitParts.length > 0) parts.push(visitParts.join(','));

  parts.push('고생하셨습니다');
  return parts.join(' / ');
}

// 그 날 등록된 비급여 구매를 "상품명(+처방일수) N명"으로 묶는다. 같은 상품이라도
// 처방일수가 다르면 따로 센다(일반한약15일 / 일반한약30일).
export function summarizePurchases(purchases: { productName: string; durationDays: number | null }[]): string {
  const counts = new Map<string, number>();
  for (const p of purchases) {
    const key = `${p.productName}${p.durationDays ? `${p.durationDays}일` : ''}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, n]) => `${key} ${n}명`)
    .join(',');
}
