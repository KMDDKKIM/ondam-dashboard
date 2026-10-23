import { careKindForPurchase } from '@/lib/careKind';

/**
 * 비급여 결제를 등록하면(한약·공진단·경옥고·린다이어트) 원장 케어 보드에 그 환자를 자동으로 올린다. 케어 보드 표는 원장만 쓸 수 있어서
 * 서버(/api/care-board-auto-add)가 대신 넣는다. 실패해도 결제 등록에는 영향이 없다.
 */
export async function autoAddCarePatient(purchase: { patientName: string; chartNo: string; productName: string; goalCategory: string | null }): Promise<void> {
  const kind = careKindForPurchase(purchase.productName, purchase.goalCategory);
  if (!kind) return;
  try {
    await fetch('/api/care-board-auto-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientName: purchase.patientName, chartNo: purchase.chartNo, kind }),
    });
  } catch {
    // 케어 보드에서 직접 등록하면 된다.
  }
}
