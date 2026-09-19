import { TIME_ONLY_PRESETS, TIME_OF_DAY_PRESETS } from "@/lib/herb-print/constants";
import type { BeforeAfter, Dose, DoseMode } from "@/lib/herb-print/types";

export default function DoseScheduleEditor({
  doses,
  mode,
  onChange,
}: {
  doses: Dose[];
  mode: DoseMode;
  onChange: (doses: Dose[]) => void;
}) {
  function updateDose(index: number, patch: Partial<Dose>) {
    const next = doses.map((d, i) => (i === index ? { ...d, ...patch } : d));
    onChange(next);
  }

  const presets = mode === "timeOnly" ? TIME_ONLY_PRESETS : TIME_OF_DAY_PRESETS;
  const datalistId = mode === "timeOnly" ? "time-only-presets" : "time-of-day-presets";

  return (
    <div className="space-y-2">
      {doses.map((dose, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-2 rounded-md border border-[#e4d9c4] bg-[#fbf7ef] px-3 py-2"
        >
          <span className="w-12 shrink-0 text-xs font-medium text-[#8a7a63]">
            {i + 1}회차
          </span>
          <input
            list={datalistId}
            value={dose.time}
            onChange={(e) => updateDose(i, { time: e.target.value })}
            placeholder="시간대 (예: 아침)"
            className="w-24 rounded border border-[#d8c9ac] bg-white px-2 py-1 text-sm"
          />
          {mode === "meal" && (
            <>
              <select
                value={dose.beforeAfter}
                onChange={(e) =>
                  updateDose(i, { beforeAfter: e.target.value as BeforeAfter })
                }
                className="rounded border border-[#d8c9ac] bg-white px-2 py-1 text-sm"
              >
                <option value="식전">식전</option>
                <option value="식후">식후</option>
              </select>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  value={dose.minutes}
                  onChange={(e) => updateDose(i, { minutes: e.target.value })}
                  placeholder="분"
                  className="w-16 rounded border border-[#d8c9ac] bg-white px-2 py-1 text-sm"
                />
                <span className="text-xs text-[#8a7a63]">분</span>
              </div>
            </>
          )}
          {mode === "timeOnly" && (
            <span className="text-xs text-[#8a7a63]">1포 (식사 시간 무관)</span>
          )}
        </div>
      ))}
      <datalist id={datalistId}>
        {presets.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}
