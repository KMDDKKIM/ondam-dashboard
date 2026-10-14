"use client";

import { useEffect, useRef, useState } from "react";
import LetterPreview from "@/components/herb-print/LetterPreview";
import PrescriptionForm from "@/components/herb-print/PrescriptionForm";
import { defaultDoses } from "@/lib/herb-print/constants";
import { makeEmptyPrescription } from "@/lib/herb-print/defaults";
import { get, save } from "@/lib/herb-print/storage";
import type { Prescription } from "@/lib/herb-print/types";
import { createClient } from "@/lib/supabase/client";
import { listDoctors } from "@/lib/supabase/doctors";

export default function Home() {
  const [data, setData] = useState<Prescription>(() => makeEmptyPrescription());
  const [doctorNames, setDoctorNames] = useState<string[]>([]);
  const [savedMessage, setSavedMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [fromPrescription, setFromPrescription] = useState("");

  // "인쇄하기"를 누르면 먼저 저장하고 인쇄한다. 인쇄 창이 닫히면(afterprint) 새 안내문 화면으로 돌아가고 "인쇄 완료"를 띄워,
  // 인쇄했는지 헷갈려 또 인쇄하는 일이 없게 한다(원장 요청, 2026-10-14). 다시 뽑아야 하면 안내의 링크로 저장된 안내문을 불러온다.
  const [pendingPrint, setPendingPrint] = useState(false);
  const printedByButton = useRef(false);
  const printSnapshot = useRef<{ id: string; patientName: string } | null>(null);
  const [printedNotice, setPrintedNotice] = useState<{ id: string; patientName: string } | null>(null);

  // 한약 처방전 화면에서 넘어오면(?patientName=…&dosesPerDay=3) 환자 성함과 하루 복용 횟수를 채워 둔다 — 복용법은
  // 처방전을 낸 바로 다음에 쓰는 일이 많아서(원장 요청, 2026-10-13). 복용 횟수는 2·3회만 안내문에서 고를 수 있다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const patientName = params.get("patientName")?.trim();
    if (!patientName || params.get("load")) return;
    const doses = Number(params.get("dosesPerDay"));
    window.history.replaceState(null, "", "/herb-print");
    setData((prev) => {
      const count = doses === 2 || doses === 3 ? doses : null;
      return {
        ...prev,
        patientName,
        ...(count ? { dosesPerDay: count, doses: defaultDoses(count, prev.doseMode) } : {}),
      };
    });
    setFromPrescription(doses === 2 || doses === 3 ? `${patientName} 님 · 하루 ${doses}회` : patientName + " 님");
  }, []);

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

  // 진료의 목록은 더 이상 코드에 박혀 있지 않다 — 대표원장·부원장 직원 계정에서 자동으로
  // 맞춰진 doctors 테이블을 그때그때 불러온다(감사 결과 #5). 아직 처방 진료의를 안 고른
  // 새 안내문이면 첫 번째 값으로 채운다.
  useEffect(() => {
    const supabase = createClient();
    listDoctors(supabase)
      .then((doctors) => {
        const names = doctors.filter((d) => d.active).map((d) => d.name);
        setDoctorNames(names);
        if (names.length > 0) {
          setData((prev) => (prev.doctorName ? prev : { ...prev, doctorName: names[0] }));
        }
      })
      .catch(() => {
        // 못 불러와도 처방 입력 자체는 계속 쓸 수 있어야 한다(목록이 비어 보일 뿐).
      });
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

  async function handlePrint() {
    if (saving) return;
    setSaving(true);
    setErrorMessage("");
    setPrintedNotice(null);
    try {
      // 인쇄 뒤 화면이 새 안내문으로 바뀌어도 내용이 남도록 먼저 저장한다.
      const saved = await save({ ...data, updatedAt: new Date().toISOString() });
      setData(saved);
      // 저장 결과가 인쇄용 시트에 반영된 다음에 인쇄 창을 연다.
      setPendingPrint(true);
    } catch {
      setErrorMessage("저장에 실패해서 인쇄하지 않았습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!pendingPrint) return;
    setPendingPrint(false);
    printedByButton.current = true;
    printSnapshot.current = { id: data.id, patientName: data.patientName };
    window.print();
  }, [pendingPrint, data.id, data.patientName]);

  useEffect(() => {
    const onAfterPrint = () => {
      if (!printedByButton.current) return; // 버튼이 아니라 브라우저 메뉴·단축키로 인쇄한 경우는 그대로 둔다
      printedByButton.current = false;
      const snap = printSnapshot.current;
      printSnapshot.current = null;
      setPrintedNotice(snap);
      setFromPrescription("");
      setSavedMessage("");
      setData((prev) => ({ ...makeEmptyPrescription(), doctorName: prev.doctorName }));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  function reloadPrinted() {
    if (!printedNotice) return;
    get(printedNotice.id)
      .then((record) => {
        if (record) {
          setData(record);
          setPrintedNotice(null);
        }
      })
      .catch(() => setErrorMessage("기록을 불러오지 못했습니다."));
  }

  function handleNew() {
    setData((prev) => ({ ...makeEmptyPrescription(), doctorName: prev.doctorName }));
    setPrintedNotice(null);
    setFromPrescription("");
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
          {printedNotice && (
            <div className="mb-3 rounded border border-[#3b7a4f] bg-[#e8f1ec] px-3 py-3 text-sm text-[#2f6342]">
              <p className="font-semibold">
                ✔ 인쇄 완료{printedNotice.patientName.trim() ? ` — ${printedNotice.patientName} 님 복용법` : ""}
              </p>
              <p className="mt-1 text-xs">
                저장도 되어 있어요. 화면은 새 안내문으로 비웠으니 다음 환자를 입력하세요. 한 번 더 뽑아야 하면{" "}
                <button type="button" className="underline" onClick={reloadPrinted}>
                  방금 안내문 다시 불러오기
                </button>
                .
              </p>
            </div>
          )}
          {fromPrescription && (
            <p className="mb-3 rounded bg-[#e8f1ec] px-3 py-2 text-xs text-[#3b7a4f]">
              한약 처방전에서 가져왔어요: {fromPrescription}
            </p>
          )}
          <PrescriptionForm value={data} onChange={setData} doctorNames={doctorNames} />
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
              disabled={saving}
              className="rounded border border-[#5b3a29] px-4 py-2 text-sm font-medium text-[#5b3a29] disabled:opacity-60"
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
