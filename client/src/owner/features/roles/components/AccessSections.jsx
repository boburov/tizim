// Components
import InputSearch from "@/shared/components/ui/input/InputSearch";
import SectionGrid from "./SectionGrid";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";

// Utils
import { countSelectedIn, countTotalIn } from "../utils/access.utils";
import { gridIds } from "../utils/grid.utils";
import { groupModulesBySection, filterSections } from "../utils/sections";

// Ruxsatlar: har bo'lim uchun alohida jadval (modul x amal).
//
// Nega bitta katta jadval emas: tizimda 11 xil amal bor, lekin bir modulda
// ularning 1-5 tasi uchraydi. Yagona jadvalda ustunlarning ko'pchiligi bo'sh
// qolib, gorizontal scroll'da sarlavha yo'qolardi. Bo'limga bo'linganda
// har jadvalda 3-7 ustun qoladi va hammasi ekranga sig'adi.
const AccessSections = ({
  matrix,
  selected,
  onChange,
  disabled = false,
  emptyText = "Tizimda ruxsatlar topilmadi",
}) => {
  const ui = useObjectState({ query: "" });
  const { query, setField } = ui;

  const modules = matrix?.modules || [];
  const actions = matrix?.actions || [];

  if (!modules.length) {
    return (
      <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  const sections = filterSections(groupModulesBySection(modules), query);
  const totalChosen = countSelectedIn(modules, selected);
  const totalAll = countTotalIn(modules);

  const setAll = (turnOn) => {
    if (disabled) return;
    onChange(turnOn ? new Set(gridIds(modules)) : new Set());
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1">
          <InputSearch
            name="permissionSearch"
            value={query}
            placeholder="Modul yoki ruxsat qidirish..."
            onChange={(e) => setField("query", e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setAll(true)}
            className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            Hammasini tanlash
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setAll(false)}
            className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            Tozalash
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Jami {totalChosen} / {totalAll} ta ruxsat tanlangan
        </span>
        {/* "—" belgisini izohlaymiz: aks holda u "taqiqlangan" kabi
            tushuniladi, aslida esa modulda bunday amal umuman yo'q. */}
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground/40">—</span>
          bu modulda bunday amal yo'q
        </span>
      </div>

      {!sections.length ? (
        <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
          "{query}" bo'yicha hech narsa topilmadi
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <section key={section.key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">{section.label}</h3>
                  <span className="text-xs text-muted-foreground">
                    {countSelectedIn(section.items, selected)} /{" "}
                    {countTotalIn(section.items)}
                  </span>
                </div>

                <SectionGrid
                  items={section.items}
                  actions={actions}
                  selected={selected}
                  onChange={onChange}
                  disabled={disabled}
                />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AccessSections;
