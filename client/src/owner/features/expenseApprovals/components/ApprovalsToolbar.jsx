// Icons
import { SlidersHorizontal, X } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import Select from "@/shared/components/ui/select/Select";
import InputSearch from "@/shared/components/ui/input/InputSearch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/shadcn/popover";

// Constants
import { CATEGORY_OPTIONS, KIND_OPTIONS, SORT_OPTIONS } from "../constants";

/**
 * Jadval ustidagi boshqaruv qatori.
 *
 * TAQSIMOT QOIDASI: doim kerak bo'ladigan narsa ko'rinib turadi (qidiruv,
 * saralash), kamdan-kam ishlatiladigani popover ichida (kategoriya, tur,
 * sana oralig'i). Hammasi bir qatorga chiqarilsa toolbar jadvaldan
 * balandroq bo'lib qolardi.
 */
const ApprovalsToolbar = ({ filters, activeCount, onReset }) => (
  <div className="flex flex-wrap items-center gap-2">
    <div className="min-w-[220px] flex-1">
      <InputSearch
        value={filters.search}
        placeholder="Ism, guruh yoki izoh bo'yicha..."
        onChange={(e) => filters.setFields({ search: e.target.value, page: 1 })}
      />
    </div>

    <Select
      value={filters.sort}
      options={SORT_OPTIONS}
      triggerClassName="w-[170px]"
      onChange={(v) => filters.setFields({ sort: v || "-createdAt", page: 1 })}
    />

    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <SlidersHorizontal size={16} strokeWidth={1.5} />
          Filtr
          {activeCount > 0 && (
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-white">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-600">Kategoriya</label>
          <Select
            value={filters.category}
            options={CATEGORY_OPTIONS}
            onChange={(v) => filters.setFields({ category: v, page: 1 })}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-600">Tur</label>
          <Select
            value={filters.kind}
            options={KIND_OPTIONS}
            onChange={(v) => filters.setFields({ kind: v, page: 1 })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-600">Dan</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                filters.setFields({ dateFrom: e.target.value, page: 1 })
              }
              className="h-10 w-full rounded-md border bg-white px-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-600">Gacha</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) =>
                filters.setFields({ dateTo: e.target.value, page: 1 })
              }
              className="h-10 w-full rounded-md border bg-white px-2 text-sm"
            />
          </div>
        </div>

        {activeCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            className="w-full gap-2"
            onClick={onReset}
          >
            <X size={16} strokeWidth={1.5} />
            Filtrlarni tozalash
          </Button>
        )}
      </PopoverContent>
    </Popover>
  </div>
);

export default ApprovalsToolbar;
