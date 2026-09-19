import { FOOD_RESTRICTION_OPTIONS } from "@/lib/herb-print/constants";

export default function FoodChecklist({
  selected,
  other,
  onChangeSelected,
  onChangeOther,
}: {
  selected: string[];
  other: string;
  onChangeSelected: (selected: string[]) => void;
  onChangeOther: (other: string) => void;
}) {
  function toggle(food: string) {
    if (selected.includes(food)) {
      onChangeSelected(selected.filter((f) => f !== food));
    } else {
      onChangeSelected([...selected, food]);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {FOOD_RESTRICTION_OPTIONS.map((food) => (
          <label
            key={food}
            className="flex items-center gap-1.5 rounded border border-[#e4d9c4] bg-[#fbf7ef] px-2 py-1.5 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.includes(food)}
              onChange={() => toggle(food)}
              className="accent-[#a63a2e]"
            />
            {food}
          </label>
        ))}
      </div>
      <input
        value={other}
        onChange={(e) => onChangeOther(e.target.value)}
        placeholder="기타 직접입력 (쉼표로 구분)"
        className="mt-2 w-full rounded border border-[#d8c9ac] bg-white px-2 py-1.5 text-sm"
      />
    </div>
  );
}
