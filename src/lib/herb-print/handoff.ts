// 한약 처방전 화면 → 복용법(/herb-print) 화면으로 넘어가는 주소. 환자 성함과 하루 복용 횟수(복용법에서 고를 수 있는 2·3회일 때만)를
// 실어 보내고, 복용법 화면(herb-print/page.tsx)이 이 두 값을 읽어 채운다.
export function herbPrintHref(patientName: string, dosesPerDay: number): string {
  const doses = dosesPerDay === 2 || dosesPerDay === 3 ? `&dosesPerDay=${dosesPerDay}` : "";
  return `/herb-print?patientName=${encodeURIComponent(patientName.trim())}${doses}`;
}
