import { DOCTOR_NAMES, TEMPERATURES, defaultDoses } from "@/lib/herb-print/constants";
import type { DoctorName, DoseMode, Prescription, Temperature } from "@/lib/herb-print/types";
import DoseScheduleEditor from "./DoseScheduleEditor";
import FoodChecklist from "./FoodChecklist";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[#6b5a44]">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded border border-[#d8c9ac] bg-white px-2.5 py-1.5 text-sm";

export default function PrescriptionForm({
  value,
  onChange,
}: {
  value: Prescription;
  onChange: (next: Prescription) => void;
}) {
  function set<K extends keyof Prescription>(key: K, v: Prescription[K]) {
    onChange({ ...value, [key]: v });
  }

  function setDosesPerDay(count: 2 | 3) {
    onChange({
      ...value,
      dosesPerDay: count,
      doses: defaultDoses(count, value.doseMode),
    });
  }

  function setDoseMode(mode: DoseMode) {
    onChange({
      ...value,
      doseMode: mode,
      doses: defaultDoses(value.dosesPerDay, mode),
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="처방 한의사">
          <select
            className={inputClass}
            value={value.doctorName}
            onChange={(e) => set("doctorName", e.target.value as DoctorName)}
          >
            {DOCTOR_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="탕전 날짜">
          <input
            type="date"
            className={inputClass}
            value={value.brewDate}
            onChange={(e) => set("brewDate", e.target.value)}
          />
        </Field>
      </div>

      <Field label="환자 성함">
        <input
          className={inputClass}
          value={value.patientName}
          onChange={(e) => set("patientName", e.target.value)}
          placeholder="홍길동"
        />
      </Field>

      <Field label="주소증">
        <input
          className={inputClass}
          value={value.chiefComplaint}
          onChange={(e) => set("chiefComplaint", e.target.value)}
          placeholder="예: 만성 소화불량, 수면장애"
        />
      </Field>

      <div>
        <label className="mb-1 block text-xs font-medium text-[#6b5a44]">
          하루 복용 횟수
        </label>
        <div className="flex gap-2">
          {([2, 3] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setDosesPerDay(n)}
              className={`rounded px-3 py-1.5 text-sm ${
                value.dosesPerDay === n
                  ? "bg-[#a63a2e] text-white"
                  : "border border-[#d8c9ac] bg-white text-[#6b5a44]"
              }`}
            >
              하루 {n}회
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          {(
            [
              { mode: "meal" as const, label: "식전/식후 기준" },
              { mode: "timeOnly" as const, label: "식사 시간 관계없이 (오전/오후 등)" },
            ]
          ).map((opt) => (
            <button
              key={opt.mode}
              type="button"
              onClick={() => setDoseMode(opt.mode)}
              className={`rounded px-3 py-1.5 text-xs ${
                value.doseMode === opt.mode
                  ? "bg-[#5b3a29] text-white"
                  : "border border-[#d8c9ac] bg-white text-[#6b5a44]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="mt-2">
          <DoseScheduleEditor
            doses={value.doses}
            mode={value.doseMode}
            onChange={(doses) => set("doses", doses)}
          />
        </div>
      </div>

      <Field label="복용 온도">
        <div className="flex gap-2">
          {TEMPERATURES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set("temperature", t as Temperature)}
              className={`rounded px-3 py-1.5 text-sm ${
                value.temperature === t
                  ? "bg-[#a63a2e] text-white"
                  : "border border-[#d8c9ac] bg-white text-[#6b5a44]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>

      <div>
        <label className="mb-1 block text-xs font-medium text-[#6b5a44]">
          복용 시 금해야 할 음식
        </label>
        <FoodChecklist
          selected={value.restrictedFoods}
          other={value.restrictedFoodsOther}
          onChangeSelected={(v) => set("restrictedFoods", v)}
          onChangeOther={(v) => set("restrictedFoodsOther", v)}
        />
      </div>

      <Field label="보관 방법">
        <textarea
          className={`${inputClass} min-h-20`}
          value={value.storageNote}
          onChange={(e) => set("storageNote", e.target.value)}
        />
      </Field>

      <Field label="기타 사항">
        <textarea
          className={`${inputClass} min-h-20`}
          value={value.etcNote}
          onChange={(e) => set("etcNote", e.target.value)}
        />
      </Field>

      <Field label="원장님이 전하고 싶은 말 (선택)">
        <textarea
          className={`${inputClass} min-h-20`}
          value={value.personalNote}
          onChange={(e) => set("personalNote", e.target.value)}
          placeholder="예: 쾌차하셔서 얼른 좋아하시는 등산을 마음껏 하실 수 있으시면 좋겠습니다."
        />
      </Field>
    </div>
  );
}
