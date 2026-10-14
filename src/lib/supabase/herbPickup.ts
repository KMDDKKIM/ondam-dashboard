import type { SupabaseClient } from '@supabase/supabase-js';
import { isFirstOfCourse, orderDays, prescriptionCalls } from '@/lib/herbCallSchedule';
import { planCallResync, type CallSlot, type ExistingCall } from '@/lib/nonCoveredCalls';
import { createManualEntry, getManualEntryStates, removeOpenManualEntries, updateUntouchedManualEntry } from './happyCallQueue';

// 처방전 출력 → 한약 대기방 "수령예정일 입력 대기" → 수령예정일 입력 → 해피콜(수령확인·중간상담) 생성(원장 결정, 2026-10-14).
// 일정 계산은 lib/herbCallSchedule.ts. 해피콜은 비급여 구매에서 만드는 것과 같은 수동 콜(happy_call_manual_entries)이다.

const TABLE = 'herb_compounding_orders';

export interface PickupOrder {
  id: string;
  patientName: string;
  chartNo: string;
  orderDate: string;
  /** 며칠분(없으면 첩수) */
  days: number;
  printedAt: string | null;
  pickupDate: string | null;
}

interface Row {
  id: string;
  patient_name: string;
  chart_no: string | null;
  order_date: string;
  packet_count: number | string;
  days_supply: number | string | null;
  printed_at?: string | null;
  pickup_date?: string | null;
  call_entry_id?: string | null;
  call_entry_id_2?: string | null;
}

function rowToPickup(r: Row): PickupOrder {
  return {
    id: r.id,
    patientName: r.patient_name,
    chartNo: r.chart_no ?? '',
    orderDate: r.order_date,
    days: orderDays({ daysSupply: r.days_supply == null ? null : Number(r.days_supply), packetCount: Number(r.packet_count) }),
    printedAt: r.printed_at ?? null,
    pickupDate: r.pickup_date ?? null,
  };
}

/** 출력은 끝났는데 수령예정일을 아직 안 넣은 처방전(오래된 출력부터). "제외"한 것은 뺀다. */
export async function listPendingPickupOrders(supabase: SupabaseClient): Promise<PickupOrder[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .not('printed_at', 'is', null)
    .is('pickup_date', null)
    .eq('pickup_dismissed', false)
    .order('printed_at', { ascending: true })
    .limit(100);
  if (error) throw error;
  return (data as Row[]).map(rowToPickup);
}

/** 왼쪽 메뉴·홈 알림용 건수. 읽기에 실패하면(칸을 만드는 SQL 전 등) null. */
export async function countPendingPickupOrders(supabase: SupabaseClient): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .not('printed_at', 'is', null)
      .is('pickup_date', null)
      .eq('pickup_dismissed', false);
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

/** 처방전 출력을 마쳤다고 기록한다(처음 한 번만). 칸이 아직 없어도 출력 자체에는 영향이 없게 실패는 삼킨다. */
export async function markOrderPrinted(supabase: SupabaseClient, id: string): Promise<void> {
  if (!id) return;
  try {
    await supabase.from(TABLE).update({ printed_at: new Date().toISOString() }).eq('id', id).is('printed_at', null);
  } catch {
    // 수령예정일 입력 알림만 안 뜰 뿐이다.
  }
}

/** 수령예정일을 입력하지 않고 대기에서 뺀다(취소한 출력 등). */
export async function dismissPickup(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from(TABLE).update({ pickup_dismissed: true }).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('처리하지 못했습니다.');
}

// 환자 연락처 — 비급여 구매에 적은 번호(차트번호 → 이름 순), 없으면 내원 이력. 못 찾으면 null(목록에서 번호 없이 보인다).
async function findPhone(supabase: SupabaseClient, chartNo: string, patientName: string): Promise<string | null> {
  try {
    let query = supabase.from('non_covered_purchases').select('phone').not('phone', 'is', null).order('purchase_date', { ascending: false }).limit(1);
    query = chartNo ? query.eq('chart_no', chartNo) : query.eq('patient_name', patientName);
    const { data } = await query;
    const phone = (data?.[0] as { phone?: string | null } | undefined)?.phone?.trim();
    if (phone) return phone;
    if (chartNo) {
      const { data: hist } = await supabase.from('patient_visit_history').select('phone').eq('chart_no', chartNo).not('phone', 'is', null).limit(1);
      const p = (hist?.[0] as { phone?: string | null } | undefined)?.phone?.trim();
      if (p) return p;
    }
  } catch {
    // 연락처 없이도 해피콜은 만든다.
  }
  return null;
}

export interface PickupResult {
  created: number;
  updated: number;
  removed: number;
  /** 같은 환자의 같은 날 같은 수령예정일 처방전이 이미 있어 해피콜을 새로 만들지 않았다 */
  duplicate: boolean;
  calls: { callDate: string; note: string }[];
}

/**
 * 수령예정일을 정하고(또는 바꾸고) 그 처방전의 해피콜을 맞춘다. 이미 전화했거나 끝난 해피콜은 절대 안 건드리고, 아직 손대지 않은
 * 것만 날짜를 옮기거나 새로 만든다(비급여 구매의 해피콜을 다시 맞출 때와 같은 규칙, planCallResync).
 */
export async function setPickupDate(supabase: SupabaseClient, orderId: string, pickupDate: string, createdBy: string | null): Promise<PickupResult> {
  const { data: orderRow, error } = await supabase.from(TABLE).select('*').eq('id', orderId).maybeSingle();
  if (error) throw error;
  if (!orderRow) throw new Error('처방전을 찾지 못했어요.');
  const order = orderRow as Row;
  const me = rowToPickup(order);

  // 같은 환자의 다른 처방전(차트번호가 있으면 차트번호, 없으면 이름)
  let priorQuery = supabase.from(TABLE).select('*').neq('id', orderId).lte('order_date', me.orderDate);
  priorQuery = me.chartNo ? priorQuery.eq('chart_no', me.chartNo) : priorQuery.eq('patient_name', me.patientName);
  const { data: priorRows, error: priorError } = await priorQuery.order('order_date', { ascending: false }).limit(50);
  if (priorError) throw priorError;
  const prior = (priorRows as Row[]).map(rowToPickup);

  // 같은 날·같은 수령예정일로 이미 해피콜을 만든 처방전이 있으면(같은 처방을 두 번 저장·출력한 경우) 중복 해피콜을 만들지 않는다.
  const duplicate = (priorRows as Row[]).some((p) => p.order_date === me.orderDate && p.pickup_date === pickupDate && (p.call_entry_id || p.call_entry_id_2));
  const desired = duplicate ? [] : prescriptionCalls({ pickupDate, days: me.days, firstOfCourse: isFirstOfCourse(me.orderDate, prior) });

  const current: Record<CallSlot, string | null> = { 1: order.call_entry_id ?? null, 2: order.call_entry_id_2 ?? null, 3: null };
  const linked = ([1, 2] as CallSlot[]).flatMap((slot) => (current[slot] ? [{ slot, id: current[slot] as string }] : []));
  const states = await getManualEntryStates(supabase, linked.map((l) => l.id));
  const existing: ExistingCall[] = linked.flatMap(({ slot, id }) => {
    const s = states.find((x) => x.id === id);
    return s ? [{ slot, ...s }] : [];
  });
  const ops = planCallResync(desired, existing);

  const phone = ops.some((o) => o.type === 'create') ? await findPhone(supabase, me.chartNo, me.patientName) : null;
  const next = { ...current };
  const createdIds: string[] = [];
  const result: PickupResult = { created: 0, updated: 0, removed: 0, duplicate, calls: desired.map((d) => ({ callDate: d.callDate, note: d.note })) };
  try {
    for (const op of ops) {
      if (op.type !== 'create') continue;
      const id = await createManualEntry(supabase, { patientName: me.patientName, note: op.note, callDate: op.callDate, createdBy, callType: '한약', phone });
      createdIds.push(id);
      next[op.slot] = id;
      result.created += 1;
    }
    for (const op of ops) if (op.type === 'remove') next[op.slot] = null;
    const { error: saveError } = await supabase
      .from(TABLE)
      .update({ pickup_date: pickupDate, call_entry_id: next[1], call_entry_id_2: next[2] })
      .eq('id', orderId);
    if (saveError) throw saveError;
  } catch (err) {
    await removeOpenManualEntries(supabase, createdIds).catch(() => {});
    throw err;
  }

  for (const op of ops) {
    if (op.type === 'update' && (await updateUntouchedManualEntry(supabase, op.id, { callDate: op.callDate, note: op.note }))) result.updated += 1;
  }
  const removeIds = ops.flatMap((o) => (o.type === 'remove' ? [o.id] : []));
  await removeOpenManualEntries(supabase, removeIds, { onlyUntouched: true });
  result.removed = removeIds.length;
  return result;
}

/** 처방전을 지우기 전에, 그 처방전으로 만든 해피콜 중 아직 손대지 않은 것을 지운다(끝났거나 전화한 해피콜은 기록이라 남긴다). */
export async function removeOrderCalls(supabase: SupabaseClient, orderId: string): Promise<void> {
  const { data } = await supabase.from(TABLE).select('call_entry_id, call_entry_id_2').eq('id', orderId).maybeSingle();
  const row = data as { call_entry_id?: string | null; call_entry_id_2?: string | null } | null;
  const ids = [row?.call_entry_id, row?.call_entry_id_2].filter((id): id is string => Boolean(id));
  if (ids.length > 0) await removeOpenManualEntries(supabase, ids, { onlyUntouched: true });
}
