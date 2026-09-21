'use client';

import { confirmDialog } from '@/lib/confirmDialog';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  listHerbInventory,
  createHerbInventoryItems,
  deleteHerbInventoryItem,
  applyHerbStockChanges,
  setHerbLowStockThreshold,
  listRecentHerbInventoryLogs,
  listStaffNames,
  stockErrorMessage,
} from '@/lib/supabase/herbInventory';
import { parseBulkHerbEntry, parseNewHerbs } from '@/lib/herbEntryParser';
import { listShortHerbs } from '@/lib/herbOrder';
import type { HerbInventoryItem, HerbInventoryLog } from '@/lib/types';
import LowStockPanel from '@/components/herb-inventory/LowStockPanel';
import BulkStockForms from '@/components/herb-inventory/BulkStockForms';
import HerbCard from '@/components/herb-inventory/HerbCard';
import HistorySection from '@/components/herb-inventory/HistorySection';

// 일괄 입력에서 반영하면 안 되는 항목들을 한 줄 문구로 만든다. 하나라도 있으면 아무것도 반영하지 않는다
// (일부만 반영되면 다시 시도할 때 이중 반영되기 때문).
function blockingProblems(parsed: ReturnType<typeof parseBulkHerbEntry>): string {
  const parts: string[] = [];
  if (parsed.unmatchedNames.length > 0) {
    parts.push(`목록에 없는 약재: ${parsed.unmatchedNames.join(', ')} (먼저 "+ 약재 추가"로 등록해주세요)`);
  }
  if (parsed.danglingNames.length > 0) {
    parts.push(`봉지 수가 안 붙은 약재: ${parsed.danglingNames.join(', ')}`);
  }
  if (parsed.invalidAmountNames.length > 0) {
    parts.push(`봉지 수는 1 이상의 정수여야 해요: ${parsed.invalidAmountNames.join(', ')}`);
  }
  return parts.join(' / ');
}

export default function HerbInventoryPage() {
  const [items, setItems] = useState<HerbInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [newHerbsText, setNewHerbsText] = useState('');
  const [addingHerbs, setAddingHerbs] = useState(false);
  const [notice, setNotice] = useState('');

  const [logs, setLogs] = useState<HerbInventoryLog[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});

  const supabase = createClient();

  // 처음 한 번만 "불러오는 중"을 보여준다(다시 불러올 때 화면을 비우면 입력 중인 내용이 사라진다).
  async function load() {
    try {
      setItems(await listHerbInventory(supabase));
    } catch {
      setError('불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
    await loadHistory();
  }

  // 이력은 부가 정보라 실패해도 재고 화면은 그대로 보여준다.
  async function loadHistory() {
    try {
      const [l, names] = await Promise.all([listRecentHerbInventoryLogs(supabase, 50), listStaffNames(supabase)]);
      setLogs(l);
      setStaffNames(names);
    } catch {
      // 이력 표시만 비어 있게 둔다.
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 여러 약재를 한 번에 등록한다. 이미 있는 이름은 건너뛰고(재고를 덮어쓰지 않는다),
  // 나머지는 한 번의 insert로 같이 넣어서 중간에 일부만 들어가는 일이 없게 한다.
  async function handleAddHerbs(event: FormEvent) {
    event.preventDefault();
    const { entries, duplicateNames, invalidStockNames } = parseNewHerbs(newHerbsText);
    if (entries.length === 0 && invalidStockNames.length === 0) return;

    const existing = new Set(items.map((i) => i.name));
    const toAdd = entries.filter((e) => !existing.has(e.name));
    const skipped = entries.filter((e) => existing.has(e.name)).map((e) => e.name);

    const warnings: string[] = [];
    if (skipped.length > 0) warnings.push(`이미 있어서 건너뜀: ${skipped.join(', ')}`);
    if (duplicateNames.length > 0) warnings.push(`중복 입력이라 처음 것만 사용: ${duplicateNames.join(', ')}`);
    if (invalidStockNames.length > 0) {
      warnings.push(`재고(봉지 수)는 정수여야 해서 등록 안 함: ${invalidStockNames.join(', ')}`);
    }
    setWarning(warnings.join(' / '));
    setError('');
    setNotice('');
    if (toAdd.length === 0) return;

    setAddingHerbs(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await createHerbInventoryItems(
        supabase,
        toAdd.map((e) => ({ name: e.name, currentStock: e.stock, createdBy: user?.id ?? null }))
      );
      const noStock = toAdd.filter((e) => e.missingStock).map((e) => e.name);
      setNotice(
        `${toAdd.length}개 추가했어요.${noStock.length > 0 ? ` (재고 숫자가 없어 0으로 등록: ${noStock.join(', ')})` : ''}`
      );
      setNewHerbsText('');
      setShowAddForm(false);
      await load();
    } catch {
      setError('약재 추가에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setAddingHerbs(false);
    }
  }

  // "당귀 천궁 3 생강 대조 1" 처럼 처방 적듯이 이름 여러 개 + 봉지 수를 한 번에 입력받아
  // 사용/입고를 DB 함수 한 번(한 트랜잭션)으로 반영한다. 목록에 없는 이름, 봉지 수가 없거나
  // 잘못된 이름이 하나라도 있으면 아무것도 반영하지 않고 알려준다. 재고가 모자라도 전체가 거부된다.
  async function handleBulkSubmit(type: 'use' | 'restock', text: string): Promise<boolean> {
    setNotice('');
    const parsed = parseBulkHerbEntry(
      text,
      items.map((i) => i.name)
    );
    const problems = blockingProblems(parsed);
    if (problems) {
      setWarning(problems);
      setError('아무것도 반영하지 않았어요. 위 항목을 고친 뒤 다시 눌러주세요.');
      return false;
    }
    setWarning('');
    setError('');
    if (parsed.matched.length === 0) return false;

    const byName = new Map(items.map((i) => [i.name, i]));
    try {
      await applyHerbStockChanges(
        supabase,
        parsed.matched.map((m) => ({
          herbId: byName.get(m.name)!.id,
          changeType: type,
          amount: m.amount,
          note: '일괄 입력',
        }))
      );
      setNotice(`${parsed.matched.length}개 약재의 ${type === 'use' ? '사용' : '입고'}을 반영했어요.`);
      await load();
      return true;
    } catch (e) {
      await load(); // 화면의 재고가 오래됐을 수 있어 다시 불러온다
      setError(stockErrorMessage(e) + ' (아무것도 반영되지 않았어요)');
      return false;
    }
  }

  async function handleDeleteHerb(item: HerbInventoryItem) {
    if (!await confirmDialog(`"${item.name}"을(를) 삭제할까요? 사용·입고 기록도 함께 지워져요.`)) return;
    setError('');
    setNotice('');
    setWarning('');
    try {
      await deleteHerbInventoryItem(supabase, item.id);
      setNotice(`${item.name}을(를) 삭제했어요.`);
      await load();
    } catch {
      setError('삭제하지 못했습니다. (삭제 권한 설정이 아직 안 됐을 수 있어요)');
    }
  }

  // 카드에서 한 약재만 사용/입고. 실패하면 메시지를 던져 카드가 보여준다.
  async function handleAdjust(item: HerbInventoryItem, type: 'use' | 'restock', amount: number, note: string | null) {
    try {
      await applyHerbStockChanges(supabase, [{ herbId: item.id, changeType: type, amount, note }]);
    } catch (e) {
      await load();
      throw new Error(stockErrorMessage(e));
    }
    setNotice('');
    await load();
  }

  async function handleSaveThreshold(item: HerbInventoryItem, threshold: number | null) {
    await setHerbLowStockThreshold(supabase, item.id, threshold);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, lowStockThreshold: threshold } : i)));
  }

  const outOfStock = useMemo(() => items.filter((i) => i.currentStock <= 0), [items]);
  const shorts = useMemo(() => listShortHerbs(items), [items]);
  const herbNames = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i.name])), [items]);
  const preview = useMemo(() => parseNewHerbs(newHerbsText).entries, [newHerbsText]);

  if (loading) return <p className="muted-text">불러오는 중...</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>한약재 재고 현황</h1>
          <p className="muted-text">재고는 봉지 수로 관리해요. 부족한 약재를 확인하고 사용·입고를 기록하세요.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddForm((v) => !v)}>
          + 약재 추가
        </button>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
      {notice && (
        <p style={{ color: 'var(--color-green)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>✅ {notice}</p>
      )}
      {warning && (
        <p style={{ color: 'var(--color-gold)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          ⚠️ {warning}
        </p>
      )}

      {outOfStock.length > 0 && (
        <div
          className="card"
          style={{ padding: 16, marginBottom: 20, borderColor: 'var(--color-error)', background: '#fdecea' }}
        >
          <div style={{ fontWeight: 700, marginBottom: 10, color: 'var(--color-error)' }}>
            🚨 재고 0 ({outOfStock.length}개)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {outOfStock.map((i) => (
              <span
                key={i.id}
                style={{
                  background: 'var(--color-error)',
                  color: '#fff',
                  borderRadius: 999,
                  padding: '4px 12px',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {i.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <LowStockPanel shorts={shorts} />

      <BulkStockForms onSubmit={handleBulkSubmit} />

      {showAddForm && (
        <form onSubmit={handleAddHerbs} className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>새 약재 여러 개 한 번에 추가</div>
          <p className="muted-text" style={{ marginBottom: 8 }}>
            약재명 뒤에 현재 재고(봉지 수, 정수)를 적어주세요. 줄바꿈이나 띄어쓰기로 구분하고, 재고가 같은 약재는 이름을 이어 쓴 뒤 숫자를
            한 번만 쓰면 돼요. 예: 당귀 5 천궁 3 생강 대조 1 (엑셀에서 복사해 붙여넣어도 돼요)
          </p>
          <textarea
            value={newHerbsText}
            onChange={(e) => setNewHerbsText(e.target.value)}
            className="input-field"
            rows={5}
            autoFocus
            placeholder={'당귀 5\n천궁 3\n생강 대조 1'}
            style={{ resize: 'vertical', marginBottom: 8 }}
          />
          {preview.length > 0 && (
            <p className="muted-text" style={{ marginBottom: 8 }}>
              추가될 약재 {preview.length}개: {preview.map((p) => `${p.name} ${p.stock}`).join(', ')}
            </p>
          )}
          <button
            type="submit"
            className="btn-primary"
            disabled={addingHerbs || preview.length === 0}
            style={{ padding: '10px 16px' }}
          >
            {addingHerbs ? '추가 중...' : preview.length > 0 ? `${preview.length}개 한 번에 추가` : '한 번에 추가'}
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <p className="muted-text">등록된 약재가 없어요. "+ 약재 추가"로 시작하세요.</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          {items.map((item) => (
            <HerbCard
              key={item.id}
              item={item}
              onSaveThreshold={handleSaveThreshold}
              onAdjust={handleAdjust}
              onDelete={handleDeleteHerb}
            />
          ))}
        </div>
      )}

      <HistorySection logs={logs} herbNames={herbNames} staffNames={staffNames} />
    </div>
  );
}
