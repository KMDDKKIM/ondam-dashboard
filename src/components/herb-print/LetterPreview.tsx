import { QRCodeSVG } from "qrcode.react";
import { CLINIC } from "@/lib/herb-print/constants";
import { buildLetter, type Segment } from "@/lib/herb-print/letterText";
import type { Prescription } from "@/lib/herb-print/types";

function Rich({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.bold ? (
          <strong key={i} className="font-bold text-[#5b3a29]">
            {s.text}
          </strong>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-[#a63a2e]">
      <span className="inline-block h-[5px] w-[5px] shrink-0 rounded-full border border-[#a63a2e]" />
      {children}
    </p>
  );
}

function CornerMark({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  const styles: Record<string, string> = {
    tl: "top-[7mm] left-[7mm] border-t-2 border-l-2",
    tr: "top-[7mm] right-[7mm] border-t-2 border-r-2",
    bl: "bottom-[7mm] left-[7mm] border-b-2 border-l-2",
    br: "bottom-[7mm] right-[7mm] border-b-2 border-r-2",
  };
  return (
    <span
      aria-hidden
      className={`absolute h-[10mm] w-[10mm] border-[#c9b89a] ${styles[position]}`}
    />
  );
}

export default function LetterPreview({ data }: { data: Prescription }) {
  const letter = buildLetter(data);

  return (
    <div className="print-area mx-auto bg-white text-[#2b2420] shadow-lg print:shadow-none">
      <div className="letter-page relative flex flex-col px-[18mm] py-[15mm]">
        <CornerMark position="tl" />
        <CornerMark position="tr" />
        <CornerMark position="bl" />
        <CornerMark position="br" />

        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden select-none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative, fixed local asset */}
          <img src="/logo-mark.png" alt="" className="watermark-logo" />
        </span>

        <header className="relative flex items-start justify-between border-b-2 border-[#c9b89a] pb-3">
          <div>
            <p className="text-[11px] tracking-[0.35em] text-[#9c8a68]">
              KOREAN MEDICINE
            </p>
            <h1 className="mt-1 font-serif-kr text-2xl font-bold text-[#5b3a29]">
              {CLINIC.name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right text-[10px] leading-relaxed text-[#8a7a63]">
              <p>{CLINIC.address}</p>
              <p>T. {CLINIC.phone}</p>
              <p>카톡 상담 : QR코드 스캔</p>
            </div>
            <QRCodeSVG
              value={CLINIC.kakaoChatUrl}
              size={56}
              level="M"
              fgColor="#5b3a29"
              className="shrink-0"
            />
          </div>
        </header>

        <div className="relative mt-3 flex items-baseline justify-between">
          <h2 className="font-serif-kr text-lg font-semibold text-[#3b2a20]">
            한약 복용 안내
          </h2>
          {letter.dateLine && (
            <p className="text-xs font-medium text-[#8a7a63]">{letter.dateLine}</p>
          )}
        </div>

        <div className="relative mt-5 font-serif-kr text-[13.5px] leading-[1.8] text-[#2b2420]">
          <p className="text-lg font-semibold text-[#3b2a20]">{letter.greeting}</p>

          <p className="mt-3 indent-[1em]">
            <Rich segments={letter.intro} />
          </p>

          <SectionLabel>탕약 드시는 법</SectionLabel>
          <p className="mt-1.5 indent-[1em]">
            <Rich segments={letter.dosage} />
          </p>

          <SectionLabel>복용 시 금해야 할 음식</SectionLabel>
          <p className="mt-1.5 indent-[1em]">
            <Rich segments={letter.foodNote} />
          </p>

          {letter.storageNote.trim() && (
            <>
              <SectionLabel>보관 방법</SectionLabel>
              <p className="mt-1.5 indent-[1em]">{letter.storageNote}</p>
            </>
          )}

          {letter.etcNote.trim() && (
            <>
              <SectionLabel>기타 사항</SectionLabel>
              <p className="mt-1.5 indent-[1em]">{letter.etcNote}</p>
            </>
          )}

          {letter.personalNote && (
            <p className="mt-4 indent-[1em] font-medium text-[#5b3a29]">
              {letter.personalNote}
            </p>
          )}

          <p className="mt-4 indent-[1em]">{letter.closing}</p>
        </div>

        <footer className="relative mt-5 border-t border-[#e4d9c4] pt-3">
          <div className="flex items-end justify-between">
            <div className="flex flex-wrap gap-1.5">
              {[data.patientName && `${data.patientName} 님`, data.chiefComplaint]
                .filter(Boolean)
                .map((tag, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-[#d8c9ac] bg-[#fbf7ef] px-2.5 py-0.5 text-[10px] text-[#6b5a44]"
                  >
                    {tag}
                  </span>
                ))}
            </div>
            <div className="flex items-center gap-3">
              <p className="font-serif-kr text-sm text-[#3b2a20]">
                {letter.signatureLine}
              </p>
              <div className="seal-mark flex h-12 w-12 shrink-0 items-center justify-center rounded-md border-2 border-[#a63a2e] text-xs font-semibold text-[#a63a2e]">
                {data.doctorName.slice(0, 1)}印
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
