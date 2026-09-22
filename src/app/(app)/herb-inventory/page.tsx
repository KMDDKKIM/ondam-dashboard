'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createHerbInventoryItems, applyHerbStockChanges, stockErrorMessage } from '@/lib/supabase/herbInventory';
import { parseBulkHerbEntry, parseNewHerbs } from '@/lib/herbEntryParser';
import { listShortHerbs } from '@/lib/herbOrder';
import { countHerbs, filterHerbs, findDuplicateHerb, groupHerbsByInitial, partitionNewHerbs, type HerbFilter } from '@/lib/herbList';
import LowStockPanel from '@/components/herb-inventory/LowStockPanel';
import BulkStockForms from '@/components/herb-inventory/BulkStockForms';
import AddHerbForm from '@/components/herb-inventory/AddHerbForm';
import HerbToolbar from '@/components/herb-inventory/HerbToolbar';
import HerbList from '@/components/herb-inventory/HerbList';
import InitialsBar from '@/components/herb-inventory/InitialsBar';
import HerbMessages from '@/components/herb-inventory/HerbMessages';
import HistorySection from '@/components/herb-inventory/HistorySection';
import { useHerbInventory } from '@/components/herb-inventory/useHerbInventory';

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
  const { supabase, items, itemsRef, loading, messages, patchMessages, logs, staffNames, load, saveThreshold, renameHerb, deleteHerb } =
    useHerbInventory();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<HerbFilter>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [highlight, setHighlight] = useState<{ id: string; seq: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // 알림(성공)은 잠시 뒤 저절로 사라진다. 오류·경고는 직접 닫을 때까지 둔다.
  useEffect(() => {
    if (!messages.notice) return;
    const t = setTimeout(() => patchMessages({ notice: '' }), 5000);
    return () => clearTimeout(t);
  }, [messages.notice, patchMessages]);

  // 그 약재가 보이도록 검색·필터를 풀고, 가운데로 스크롤해서 잠깐 강조한다.
  const revealHerb = useCallback((id: string) => {
    setQuery('');
    setFilter('all');
    setHighlight((h) => ({ id, seq: (h?.seq ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!highlight) return;
    document.getElementById(`herb-row-${highlight.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(t);
  }, [highlight]);

  // items는 항상 가나다순이라 여기서 다시 정렬하지 않고 걸러내기만 한다.
  const counts = useMemo(() => countHerbs(items), [items]);
  const visible = useMemo(() => filterHerbs(items, query, filter), [items, query, filter]);
  const grouped = query.trim() === '' && filter === 'all';
  const groupKeys = useMemo(() => (grouped ? groupHerbsByInitial(items).map((g) => g.key) : []), [grouped, items]);
  const shorts = useMemo(() => listShortHerbs(items), [items]);
  const herbNames = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i.name])), [items]);

  // "부족한 약재" 칸에서 바로 🔕 눌러 끄기.
  async function handleDisableAlarm(id: string) {
    try {
      await saveThreshold(id, null);
    } catch {
      patchMessages({ error: '알림을 끄지 못했습니다. 다시 시도해주세요.' });
    }
  }

  // 검색 결과가 딱 하나일 때 Enter → 그 행을 잠깐 강조한다.
  function handleSearchEnter() {
    if (visible.length !== 1) return;
    setHighlight((h) => ({ id: visible[0].id, seq: (h?.seq ?? 0) + 1 }));
  }

  // 행의 버튼에서 Esc → 검색창으로 돌아가 검색어를 비운다(다음 약재를 바로 찾을 수 있게).
  function handleListKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && (e.target as HTMLElement).tagName === 'BUTTON') {
      setQuery('');
      searchRef.current?.focus();
    }
  }

  // 새 약재 등록. 이미 있는 이름(공백·대소문자 무시)은 건너뛰고 그 약재를 찾아서 보여준다.
  // 나머지는 한 번의 insert로 같이 넣고, 다시 불러오면 가나다순 제자리에 들어간다.
  async function handleAddHerbs(text: string): Promise<boolean> {
    const { entries, invalidStockNames } = parseNewHerbs(text);
    if (entries.length === 0 && invalidStockNames.length === 0) return false;

    const { toAdd, existing, repeated } = partitionNewHerbs(itemsRef.current, entries);
    const warnings: string[] = [];
    if (existing.length > 0) {
      warnings.push(
        `이미 있는 약재예요 (목록에서 표시해 드려요): ${existing.map((d) => (d.entry.name === d.herb.name ? `"${d.herb.name}"` : `"${d.entry.name}" → "${d.herb.name}"`)).join(', ')}`
      );
    }
    if (repeated.length > 0) warnings.push(`중복 입력이라 처음 것만 사용: ${repeated.join(', ')}`);
    if (invalidStockNames.length > 0) warnings.push(`재고(봉지 수)는 정수여야 해서 등록 안 함: ${invalidStockNames.join(', ')}`);
    patchMessages({ warning: warnings.join(' / '), error: '', notice: '' });
    if (existing.length > 0) revealHerb(existing[0].herb.id);
    if (toAdd.length === 0) return false;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await createHerbInventoryItems(
        supabase,
        toAdd.map((e) => ({ name: e.name, currentStock: e.stock, createdBy: user?.id ?? null }))
      );
    } catch {
      patchMessages({ error: '약재 추가에 실패했습니다. 다시 시도해주세요.' });
      return false;
    }
    const noStock = toAdd.filter((e) => e.missingStock).map((e) => e.name);
    patchMessages({
      notice: `${toAdd.length}개 추가했어요.${noStock.length > 0 ? ` (재고 숫자가 없어 0봉지로 등록: ${noStock.join(', ')})` : ''}`,
    });
    await load();
    if (existing.length === 0 && toAdd.length === 1) {
      const added = findDuplicateHerb(itemsRef.current, toAdd[0].name);
      if (added) revealHerb(added.id);
    }
    if (existing.length === 0) setShowAddForm(false);
    return true;
  }

  // "당귀 천궁 3 생강 대조 1" 처럼 처방 적듯이 이름 여러 개 + 봉지 수를 한 번에 입력받아
  // 사용/입고를 DB 함수 한 번(한 트랜잭션)으로 반영한다. 목록에 없는 이름, 봉지 수가 없거나
  // 잘못된 이름이 하나라도 있으면 아무것도 반영하지 않고 알려준다. 재고가 모자라도 전체가 거부된다.
  async function handleBulkSubmit(type: 'use' | 'restock', text: string): Promise<boolean> {
    const parsed = parseBulkHerbEntry(text, itemsRef.current.map((i) => i.name));
    const problems = blockingProblems(parsed);
    if (problems) {
      patchMessages({ warning: problems, error: '아무것도 반영하지 않았어요. 위 항목을 고친 뒤 다시 눌러주세요.', notice: '' });
      return false;
    }
    patchMessages({ warning: '', error: '', notice: '' });
    if (parsed.matched.length === 0) return false;

    const byName = new Map(itemsRef.current.map((i) => [i.name, i]));
    try {
      await applyHerbStockChanges(
        supabase,
        parsed.matched.map((m) => ({
          herbId: byName.get(m.name)!.id,
          name: m.name,
          changeType: type,
          amount: m.amount,
          note: '일괄 입력',
        }))
      );
      patchMessages({ notice: `${parsed.matched.length}개 약재의 ${type === 'use' ? '사용' : '입고'}을 반영했어요.` });
      await load();
      return true;
    } catch (e) {
      await load(); // 화면의 재고가 오래됐을 수 있어 다시 불러온다
      patchMessages({ error: stockErrorMessage(e) + ' (아무것도 반영되지 않았어요)' });
      return false;
    }
  }

  if (loading) return <p className="muted-text">불러오는 중...</p>;

  return (
    <div style={{ paddingRight: groupKeys.length > 0 ? 30 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 2 }}>한약재 재고 현황</h1>
          <p className="muted-text">재고는 봉지 수로 관리해요. 재고 조정은 위 &quot;한꺼번에 입력&quot;으로만 해주세요.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddForm((v) => !v)}>
          + 약재 추가
        </button>
      </div>

      <LowStockPanel shorts={shorts} onDisableAlarm={handleDisableAlarm} />
      <BulkStockForms onSubmit={handleBulkSubmit} />
      {showAddForm && <AddHerbForm onSubmit={handleAddHerbs} onCancel={() => setShowAddForm(false)} />}

      <HerbToolbar
        query={query}
        onQuery={setQuery}
        filter={filter}
        onFilter={setFilter}
        counts={counts}
        shownCount={visible.length}
        inputRef={searchRef}
        onEnter={handleSearchEnter}
      />

      {items.length === 0 ? (
        <p className="muted-text">등록된 약재가 없어요. &quot;+ 약재 추가&quot;로 시작하세요.</p>
      ) : visible.length === 0 ? (
        <p className="muted-text" style={{ padding: '16px 4px' }}>
          {query.trim() !== ''
            ? `"${query.trim()}"에 맞는 약재가 없어요. 없는 약재라면 "+ 약재 추가"로 등록하세요.`
            : '이 조건에 맞는 약재가 없어요.'}
        </p>
      ) : (
        <div onKeyDown={handleListKeyDown}>
          <HerbList
            items={visible}
            grouped={grouped}
            highlightId={highlight?.id ?? null}
            onSaveName={renameHerb}
            onSaveThreshold={saveThreshold}
            onDelete={deleteHerb}
          />
        </div>
      )}

      <InitialsBar keys={groupKeys} />
      <HistorySection logs={logs} herbNames={herbNames} staffNames={staffNames} />
      <HerbMessages messages={messages} onDismiss={() => patchMessages({ error: '', warning: '', notice: '' })} />
    </div>
  );
}
