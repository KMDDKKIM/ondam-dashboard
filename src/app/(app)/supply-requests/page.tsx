'use client';

import { confirmDialog } from '@/lib/confirmDialog';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  createSupplyRequest,
  deleteSupplyItem,
  deleteSupplyRequest,
  listSupplyItems,
  listSupplyRequests,
  setSupplyOrdered,
  setSupplyReceived,
} from '@/lib/supabase/supplyRequests';
import { todayKst } from '@/lib/kst';
import {
  STATUS_LABEL,
  SUPPLY_CATEGORIES,
  SUPPLY_CATEGORY_HINT,
  agingBadge,
  countOpen,
  findOpenDuplicates,
  formatDate,
  matchesFilter,
  normalizeItemName,
  safeUrl,
  sortOpenOldestFirst,
  supplyStatus,
  type AgingLevel,
  type SupplyFilter,
} from '@/lib/supplyHelpers';
import type { Staff, SupplyItem, SupplyRequest } from '@/lib/types';

const CUSTOM = '__custom__';

const FILTERS: { key: SupplyFilter; label: string }[] = [
  { key: 'open', label: '진행 중' },
  { key: 'requested', label: '신청됨' },
  { key: 'ordered', label: '주문완료' },
  { key: 'received', label: '도착완료' },
  { key: 'all', label: '전체' },
];

const AGING_COLOR: Record<AgingLevel, { bg: string; fg: string }> = {
  none: { bg: 'var(--color-surface)', fg: 'var(--color-muted)' },
  yellow: { bg: '#fdf0c8', fg: '#7a5a00' },
  red: { bg: '#fbe0dd', fg: '#b3261e' },
};

const STATUS_COLOR = {
  requested: { bg: '#faf1de', fg: '#8a6a1f' },
  ordered: { bg: '#e0eefa', fg: '#245d8f' },
  received: { bg: '#e6f3e4', fg: '#2f7a45' },
} as const;

export default function SupplyRequestsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [me, setMe] = useState<{ id: string; isOwner: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<SupplyFilter>('open');

  const [category, setCategory] = useState<string>(SUPPLY_CATEGORIES[0]);
  const [itemChoice, setItemChoice] = useState(CUSTOM);
  const [customName, setCustomName] = useState('');
  const [saveAsItem, setSaveAsItem] = useState(true);
  const [orderUrl, setOrderUrl] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  // 같은 이름의 진행 중 신청이 있을 때 "그래도 신청" 확인을 기다리는 상태.
  const [duplicates, setDuplicates] = useState<SupplyRequest[]>([]);

  const [loadFailed, setLoadFailed] = useState(false);

  async function load() {
    setError('');
    setLoadFailed(false);
    try {
      const [reqs, itemRows, staffResult, userResult] = await Promise.all([
        listSupplyRequests(supabase),
        listSupplyItems(supabase),
        supabase.from('staff').select('id, name, role'),
        supabase.auth.getUser(),
      ]);
      const staff = (staffResult.data ?? []) as Staff[];
      setRequests(reqs);
      setItems(itemRows);
      setStaffList(staff);
      const userId = userResult.data.user?.id;
      if (userId) setMe({ id: userId, isOwner: staff.find((s) => s.id === userId)?.role === 'owner' });
    } catch {
      setLoadFailed(true);
      setError('불러오지 못했습니다. (물품신청 테이블이 아직 만들어지지 않았을 수 있어요)');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryItems = items.filter((i) => i.category === category);
  const usingCustom = itemChoice === CUSTOM || !categoryItems.some((i) => i.id === itemChoice);

  function staffName(id: string | null): string {
    if (!id) return '';
    return staffList.find((s) => s.id === id)?.name ?? '';
  }

  function handleCategoryChange(next: string) {
    setCategory(next);
    setItemChoice(CUSTOM);
    setOrderUrl('');
  }

  function handleItemChange(id: string) {
    setItemChoice(id);
    const picked = items.find((i) => i.id === id);
    setOrderUrl(picked?.orderUrl ?? '');
  }

  const pickedItem = categoryItems.find((i) => i.id === itemChoice);
  const currentItemName = (usingCustom ? customName : pickedItem?.name ?? '').trim();
  const currentKey = normalizeItemName(currentItemName);

  // 품목이 바뀌면 이전 중복 경고는 더 이상 유효하지 않다.
  useEffect(() => {
    setDuplicates([]);
  }, [currentKey]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!currentItemName) return setFormError('품목을 고르거나 입력해 주세요.');
    if (orderUrl.trim() && !safeUrl(orderUrl)) return setFormError('주문 링크가 올바르지 않아요.');
    const found = findOpenDuplicates(currentItemName, requests);
    if (found.length > 0) {
      setDuplicates(sortOpenOldestFirst(found));
      return;
    }
    submitRequest(currentItemName);
  }

  async function submitRequest(itemName: string) {
    setFormError('');
    // "그래도 신청" 경로에서도 주문 링크를 다시 확인한다(경고를 띄운 뒤 바뀌었을 수 있음).
    if (orderUrl.trim() && !safeUrl(orderUrl)) {
      setDuplicates([]);
      return setFormError('주문 링크가 올바르지 않아요.');
    }
    setDuplicates([]);
    setSubmitting(true);
    try {
      await createSupplyRequest(supabase, {
        category,
        itemName,
        orderUrl: safeUrl(orderUrl) ?? '',
        memo: memo.trim(),
        requestedBy: me?.id ?? null,
        saveAsItem: usingCustom && saveAsItem,
      });
      setCustomName('');
      setMemo('');
      setOrderUrl('');
      setItemChoice(CUSTOM);
      setFilter('open');
      await load();
    } catch {
      setFormError('신청에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  async function run(action: () => Promise<void>) {
    setError('');
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : '처리에 실패했습니다.');
    }
  }

  async function toggleOrdered(r: SupplyRequest) {
    if (r.orderedAt && !await confirmDialog('주문완료 표시를 취소할까요? (도착 표시도 함께 지워져요)')) return;
    run(() => setSupplyOrdered(supabase, r.id, !r.orderedAt, me?.id ?? null));
  }

  async function toggleReceived(r: SupplyRequest) {
    if (r.receivedAt && !await confirmDialog('도착 표시를 취소할까요?')) return;
    run(() => setSupplyReceived(supabase, r.id, !r.receivedAt, me?.id ?? null));
  }

  async function handleDeleteItem() {
    const picked = categoryItems.find((i) => i.id === itemChoice);
    if (!picked) return;
    if (!await confirmDialog(`"${picked.name}"을(를) 자주 쓰는 품목 목록에서 삭제할까요? (이미 한 신청 내역은 그대로 남아요)`)) return;
    setFormError('');
    deleteSupplyItem(supabase, picked.id)
      .then(() => {
        setItemChoice(CUSTOM);
        setOrderUrl('');
        return load();
      })
      .catch(() => setFormError('품목을 삭제하지 못했습니다.'));
  }

  async function handleDelete(r: SupplyRequest) {
    if (!await confirmDialog(`"${r.itemName}" 신청을 삭제할까요?`)) return;
    run(() => deleteSupplyRequest(supabase, r.id));
  }

  const today = todayKst();
  const filtered = requests.filter((r) => matchesFilter(r, filter));
  const visible = filter === 'open' ? sortOpenOldestFirst(filtered) : filtered;
  const counts = (key: SupplyFilter) => requests.filter((r) => matchesFilter(r, key)).length;
  const openCounts = countOpen(requests);

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>📦 물품신청</h1>
      <p className="muted-text" style={{ marginBottom: 20 }}>
        필요한 물품을 신청하면 원장님이 주문 후 체크하고, 물품이 도착하면 직원이 도착을 체크해요.
      </p>

      <form onSubmit={handleSubmit} className="card" style={{ padding: 18, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
              분류
            </label>
            <select className="input-field" value={category} onChange={(e) => handleCategoryChange(e.target.value)}>
              {SUPPLY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {SUPPLY_CATEGORY_HINT[c] ? `${c} (${SUPPLY_CATEGORY_HINT[c]})` : c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
              품목
            </label>
            <select
              className="input-field"
              value={usingCustom ? CUSTOM : itemChoice}
              onChange={(e) => handleItemChange(e.target.value)}
            >
              {categoryItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
              <option value={CUSTOM}>＋ 목록에 없음 (직접 입력)</option>
            </select>
            {!usingCustom && (
              <button
                type="button"
                onClick={handleDeleteItem}
                style={{ border: 'none', background: 'transparent', color: 'var(--color-error)', fontSize: 12, fontWeight: 600, padding: '4px 0 0' }}
              >
                이 품목을 목록에서 삭제
              </button>
            )}
          </div>
          {usingCustom && (
            <div>
              <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
                품목명 직접 입력
              </label>
              <input
                className="input-field"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="예: 일회용 장갑 (M)"
              />
            </div>
          )}
          <div>
            <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
              주문 링크 (선택, 간식 등)
            </label>
            <input
              className="input-field"
              value={orderUrl}
              onChange={(e) => setOrderUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
              메모 (수량 등, 선택)
            </label>
            <input
              className="input-field"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 3박스, 급해요"
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? '신청 중...' : '신청하기'}
          </button>
          {usingCustom && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={saveAsItem}
                onChange={(e) => setSaveAsItem(e.target.checked)}
                style={{ width: 'auto' }}
              />
              다음부터 목록에서 고를 수 있게 저장
            </label>
          )}
          {formError && (
            <span className="error-text" style={{ margin: 0 }}>
              {formError}
            </span>
          )}
        </div>
        {duplicates.length > 0 && (
          <div
            role="alert"
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 8,
              border: '1px solid #e8c766',
              background: '#fdf6df',
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>이미 신청된 물품이에요. 그래도 신청할까요?</div>
            <ul style={{ margin: '0 0 10px', paddingLeft: 18 }}>
              {duplicates.map((d) => (
                <li key={d.id}>
                  {d.itemName} · {staffName(d.requestedBy) || '-'} · {formatDate(d.requestedAt)} 신청 · {STATUS_LABEL[supplyStatus(d)]}
                  {d.memo ? ` · ${d.memo}` : ''}
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn-primary"
                disabled={submitting}
                onClick={() => submitRequest(currentItemName)}
                style={{ padding: '6px 14px', fontSize: 13 }}
              >
                그래도 신청
              </button>
              <button
                type="button"
                onClick={() => setDuplicates([])}
                style={{
                  padding: '6px 14px',
                  fontSize: 13,
                  borderRadius: 8,
                  border: '1px solid var(--color-line)',
                  background: 'var(--color-surface)',
                }}
              >
                취소
              </button>
            </div>
          </div>
        )}
      </form>

      {!loading && !loadFailed && (
        <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>
          주문 대기 {openCounts.waitingOrder}건 · 도착 대기 {openCounts.waitingArrival}건
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              border: '1px solid var(--color-line)',
              background: filter === key ? 'var(--color-brand-b)' : 'var(--color-surface)',
              color: filter === key ? '#fff' : 'var(--color-ink)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {label} {counts(key)}
          </button>
        ))}
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading ? (
        <p className="muted-text">불러오는 중...</p>
      ) : visible.length === 0 ? (
        <p className="muted-text">해당하는 신청이 없어요.</p>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--color-muted)', fontSize: 12 }}>
                {['신청일', '분류', '품목', '신청자', '메모', '주문 링크', '진행 상태', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-line)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const status = supplyStatus(r);
                const aging = agingBadge(status, r.requestedAt, r.orderedAt, today);
                const link = safeUrl(r.orderUrl);
                const canDelete = me?.isOwner || (me?.id === r.requestedBy && !r.orderedAt);
                const cell = { padding: '10px 12px', borderBottom: '1px solid var(--color-line)', verticalAlign: 'top' } as const;
                return (
                  <tr key={r.id}>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>{formatDate(r.requestedAt)}</td>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>{r.category}</td>
                    <td style={{ ...cell, fontWeight: 600 }}>{r.itemName}</td>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>{staffName(r.requestedBy) || '-'}</td>
                    <td style={{ ...cell, color: 'var(--color-muted)' }}>{r.memo || '-'}</td>
                    <td style={cell}>
                      {link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-brand-b)', whiteSpace: 'nowrap' }}>
                          주문하러 가기 ↗
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td style={cell}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 10px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          background: STATUS_COLOR[status].bg,
                          color: STATUS_COLOR[status].fg,
                          marginBottom: 6,
                        }}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                      {aging && (
                        <span
                          style={{
                            display: 'inline-block',
                            marginLeft: 6,
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 700,
                            background: AGING_COLOR[aging.level].bg,
                            color: AGING_COLOR[aging.level].fg,
                            marginBottom: 6,
                          }}
                        >
                          {aging.label}
                        </span>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                        <div>
                          {r.orderedAt ? (
                            <span>
                              주문 {formatDate(r.orderedAt)} ({staffName(r.orderedBy) || '-'}){' '}
                              {me?.isOwner && (
                                <LinkButton onClick={() => toggleOrdered(r)}>취소</LinkButton>
                              )}
                            </span>
                          ) : me?.isOwner ? (
                            <button onClick={() => toggleOrdered(r)} className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }}>
                              주문완료 체크
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              title="대표원장이 주문 체크해요"
                              style={{
                                padding: '4px 10px',
                                fontSize: 12,
                                borderRadius: 8,
                                border: '1px solid var(--color-line)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-muted)',
                                cursor: 'not-allowed',
                              }}
                            >
                              대표원장이 주문 체크해요
                            </button>
                          )}
                        </div>
                        {r.orderedAt && (
                          <div>
                            {r.receivedAt ? (
                              <span>
                                도착 {formatDate(r.receivedAt)} ({staffName(r.receivedBy) || '-'}){' '}
                                <LinkButton onClick={() => toggleReceived(r)}>취소</LinkButton>
                              </span>
                            ) : (
                              <button onClick={() => toggleReceived(r)} className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }}>
                                도착 체크
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={cell}>
                      {canDelete && <LinkButton onClick={() => handleDelete(r)}>삭제</LinkButton>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: 'none',
        background: 'transparent',
        color: 'var(--color-error)',
        fontSize: 12,
        fontWeight: 600,
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}
