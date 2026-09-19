"use client";

import { useEffect, useState } from "react";
import LetterPreview from "@/components/herb-print/LetterPreview";
import PrescriptionForm from "@/components/herb-print/PrescriptionForm";
import { makeEmptyPrescription } from "@/lib/herb-print/defaults";
import { get, save } from "@/lib/herb-print/storage";
import type { Prescription } from "@/lib/herb-print/types";

export default function Home() {
  const [data, setData] = useState<Prescription>(() => makeEmptyPrescription());
  const [savedMessage, setSavedMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadId = new URLSearchParams(window.location.search).get("load");
    if (!loadId) return;
    window.history.replaceState(null, "", "/herb-print");
    get(loadId)
      .then((record) => {
        if (record) setData(record);
      })
      .catch(() => setErrorMessage("기록을 불러오지 못했습니다."));
  }, []);

  async function handleSave() {
    setSaving(true);
    setErrorMessage("");
    try {
      const now = new Date().toISOString();
      const next = { ...data, updatedAt: now };
      const saved = await save(next);
      setData(saved);
      setSavedMessage("저장되었습니다.");
      setTimeout(() => setSavedMessage(""), 2000);
    } catch {
      setErrorMessage("저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  function handleNew() {
    setData(makeEmptyPrescription());
  }

  return (
    <div className="min-h-screen bg-[#f4efe4]">
      <main className="no-print mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-2">
        <section className="rounded-lg border border-[#e4d9c4] bg-white/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif-kr text-lg text-[#3b2a20]">
              환자 정보 입력
            </h2>
            <button
              type="button"
              onClick={handleNew}
              className="text-xs text-[#8a7a63] underline"
            >
              새 안내문 시작
            </button>
          </div>
          <PrescriptionForm value={data} onChange={setData} />
          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded bg-[#5b3a29] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "저장 중..." : "저장하기"}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="rounded border border-[#5b3a29] px-4 py-2 text-sm font-medium text-[#5b3a29]"
            >
              인쇄하기
            </button>
            {savedMessage && (
              <span className="text-sm text-[#3b7a4f]">{savedMessage}</span>
            )}
            {errorMessage && (
              <span className="text-sm text-[#a63a2e]">{errorMessage}</span>
            )}
          </div>
        </section>

        <section className="lg:sticky lg:top-6 lg:self-start">
          <h2 className="mb-4 font-serif-kr text-lg text-[#3b2a20]">미리보기</h2>
          <div className="preview-scale">
            <LetterPreview data={data} />
          </div>
        </section>
      </main>

      <div className="print-only">
        <LetterPreview data={data} />
      </div>
    </div>
  );
}
