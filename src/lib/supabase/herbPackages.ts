import type { SupabaseClient } from '@supabase/supabase-js';
import { isCountedOrder, packageBalance, packageDaysFromPurchase, type PackageBalance, type PackageRow, type PrintedOrder } from '@/lib/herbPackage';

// 한약 패키지(herb_packages) — 비급여 결제(한약)에서 자동으로 만들고, 처방전 출력분의 며칠분을 차감해 잔여를 계산한다(원장 요청, 2026-10-21).

const TABLE = 'herb_packages';

// PostgREST 필터 문자열에서 쓰이는 문자(쉼표·괄호·따옴표)를 이름에서 뺀다.
function safe(value: string): string {
  return value.replace(/[,()"%*\\]/g, ' ').trim();
}

export interface PurchaseForPackage {
  id: string;
  patientName: string;
  chartNo: string;
  productName: string;
  goalCategory: string | null;
  durationDays: number | null;
  purchaseDate: string;
}

/**
 * 비급여 결제에 맞는 패키지를 만들거나(상품명 3개월→90일, 1개월→30일 등) 고친다. 패키지가 아니게 바뀌었으면 지운다.
 * 결제는 이미 저장됐으니 실패해도 결제 등록에는 영향이 없게 호출하는 쪽에서 오류를 삼킨다.
 */
export async function syncPackageForPurchase(supabase: SupabaseClient, purchase: PurchaseForPackage, createdBy: string | null): Promise<void> {
  const days = packageDaysFromPurchase({ productName: purchase.productName, goalCategory: purchase.goalCategory, durationDays: purchase.durationDays });
  if (days == null) {
    const { error } = await supabase.from(TABLE).delete().eq('purchase_id', purchase.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from(TABLE).upsert(
    {
      patient_name: purchase.patientName.trim(),
      chart_no: purchase.chartNo.trim() || null,
      total_days: days,
      start_date: purchase.purchaseDate,
      purchase_id: purchase.id,
      created_by: createdBy,
    },
    { onConflict: 'purchase_id' }
  );
  if (error) throw error;
}

export interface PatientRef {
  patientName: string;
  chartNo: string;
}

/**
 * 환자의 한약 패키지 잔액. 차트번호가 있으면 차트번호로, 없으면 이름으로 찾는다. 패키지가 없으면 null.
 * excludeOrderId 는 지금 작성 중인 처방전(이미 출력돼 있으면 잔액에서 빼고 계산한다).
 */
export async function loadPackageBalance(supabase: SupabaseClient, patient: PatientRef, excludeOrderId?: string): Promise<PackageBalance | null> {
  const name = safe(patient.patientName);
  const chart = safe(patient.chartNo);
  if (!name && !chart) return null;

  let packageQuery = supabase.from(TABLE).select('total_days, start_date');
  packageQuery = chart ? packageQuery.eq('chart_no', chart) : packageQuery.eq('patient_name', name);
  const { data: pkgs, error } = await packageQuery;
  if (error) throw error;
  const packages: PackageRow[] = ((pkgs ?? []) as { total_days: number; start_date: string }[]).map((p) => ({ totalDays: p.total_days, startDate: p.start_date }));
  if (packages.length === 0) return null;

  const start = packages.map((p) => p.startDate).sort()[0];
  let orderQuery = supabase
    .from('herb_compounding_orders')
    .select('id, order_date, days_supply, packet_count, printed_at')
    .gte('order_date', start)
    .limit(500);
  orderQuery = chart && name ? orderQuery.or(`chart_no.eq.${chart},and(chart_no.is.null,patient_name.eq.${name})`) : chart ? orderQuery.eq('chart_no', chart) : orderQuery.eq('patient_name', name);
  const { data: orders, error: orderError } = await orderQuery;
  if (orderError) throw orderError;
  const printed: PrintedOrder[] = ((orders ?? []) as { id: string; order_date: string; days_supply: number | string | null; packet_count: number | string | null; printed_at: string | null }[])
    .filter((o) => o.id !== excludeOrderId && isCountedOrder({ orderDate: o.order_date, printedAt: o.printed_at }))
    .map((o) => ({ orderDate: o.order_date, daysSupply: o.days_supply == null ? null : Number(o.days_supply), packetCount: o.packet_count == null ? null : Number(o.packet_count) }));
  return packageBalance(packages, printed);
}

export interface PatientPackage {
  id: string;
  totalDays: number;
  startDate: string;
  /** 비급여 결제에서 자동으로 만들어진 것이 아니라 케어 보드에서 직접 넣은 것 */
  manual: boolean;
}

/** 케어 보드에서 이미 결제한 환자의 한약 결제 일수를 직접 넣는다(비급여 결제와 연결되지 않은 패키지). */
export async function addManualPackage(supabase: SupabaseClient, input: { patientName: string; chartNo: string; totalDays: number; startDate: string }): Promise<void> {
  const { error } = await supabase.from(TABLE).insert({
    patient_name: input.patientName.trim(),
    chart_no: input.chartNo.trim() || null,
    total_days: input.totalDays,
    start_date: input.startDate,
    purchase_id: null,
  });
  if (error) throw error;
}

/** 직접 넣은 패키지를 지운다(결제에서 자동으로 만든 패키지는 비급여 결제 기록에서 관리하므로 지우지 않는다). */
export async function deleteManualPackage(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).is('purchase_id', null).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('지우지 못했어요.');
}
