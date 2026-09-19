"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import LetterPreview from "@/components/herb-print/LetterPreview";
import { duplicateForRepeat } from "@/lib/herb-print/defaults";
import { getAll, remove, save } from "@/lib/herb-print/storage";
import type { Prescription } from "@/lib/herb-print/types";
import { formatKoreanDate } from "@/lib/herb-print/letterText";

export default function RecordsPage() {
  const router = useRouter();
  const [records, setRecords] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [query, setQuery] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      setRecords(await getAll());
    } catch {
      setErrorMessage("기록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Data fetch: the setLoading(true) at the top of loadRecords runs
    // synchronously, which the lint rule can't see past the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRecords();
  }, [loadRecords]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return records;
    return records.filter((r) => r.patientName.includes(q));
  }, [records, query]);

  const previewRecord = records.find((r) => r.id === previewId) ?? null;

  function handleEdit(id: string) {
    router.push(`/herb-print?load=${id}`);
  }

  async function handleRepeat(id: string) {
    const original = records.find((r) => r.id === id);
    if (!original) return;
    const copy = duplicateForRepeat(original);
    try {
      await save(copy);
      router.push(`/herb-print?load=${copy.id}`);
    } catch {
      setErrorMessage("리핏 생성에 실패했습니다.");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("이 기록을 삭제할까요?")) return;
    try {
      await remove(id);
      await loadRecords();
      if (previewId === id) setPreviewId(null);
    } catch {
      setErrorMessage("삭제에 실패했습니다.");
    }
  }

  return (
    <div className="min-h-screen bg-[#f4efe4]">

      <div className="no-print mx-auto max-w-4xl px-4 py-6">
        <h2 className="mb-4 font-serif-kr text-lg text-[#3b2a20]">
          저장된 기록
        </h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="환자 성함으로 검색"
          className="mb-4 w-full rounded border border-[#d8c9ac] bg-white px-3 py-2 text-sm"
        />

        {errorMessage && (
          <p className="mb-4 text-sm text-[#a63a2e]">{errorMessage}</p>
        )}

        {loading ? (
          <p className="text-sm text-[#8a7a63]">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[#8a7a63]">저장된 기록이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-[#e4d9c4] bg-white/70 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-[#3b2a20]">
                    {r.patientName || "(이름 없음)"}
                  </p>
                  <p className="text-xs text-[#8a7a63]">
                    {r.chiefComplaint} · 탕전일 {formatKoreanDate(r.brewDate)} ·
                    처방 {r.doctorName}
                  </p>
                </div>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setPreviewId(r.id)}
                    className="rounded border border-[#5b3a29] px-3 py-1.5 text-[#5b3a29]"
                  >
                    미리보기/인쇄
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(r.id)}
                    className="rounded border border-[#d8c9ac] px-3 py-1.5 text-[#6b5a44]"
                  >
                    불러와서 수정
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRepeat(r.id)}
                    className="rounded border border-[#d8c9ac] px-3 py-1.5 text-[#6b5a44]"
                  >
                    리핏(재처방)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(r.id)}
                    className="rounded border border-[#d8c9ac] px-3 py-1.5 text-[#a63a2e]"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {previewRecord && (
        <div>
          <div className="no-print mx-auto flex max-w-4xl items-center gap-2 px-4">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded bg-[#5b3a29] px-4 py-2 text-sm font-medium text-white"
            >
              인쇄하기
            </button>
            <button
              type="button"
              onClick={() => setPreviewId(null)}
              className="rounded border border-[#d8c9ac] px-4 py-2 text-sm text-[#6b5a44]"
            >
              닫기
            </button>
          </div>
          <LetterPreview data={previewRecord} />
        </div>
      )}
    </div>
  );
}
