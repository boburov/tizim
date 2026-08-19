import { ChevronLeft, ChevronRight, Home } from "lucide-react";

import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/shared/components/shadcn/sheet";
import { cn } from "@/shared/utils/cn";
import useDrill from "./useDrill";
import { nodeLabel, stackFilters, isTerminal } from "./drillNodes";
import DrillSections from "./DrillSections";
import { TransactionDetail } from "./TransactionDetail";

/**
 * ══════════════════════════════════════════════════════════════════════
 * UNIVERSAL TAFSILOT PANELI (talab 12)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ILOVADA BITTA. Har ekran o'z panelini yozsa, ular bir-biridan
 * farq qilib ketardi: birida "orqaga" bor, boshqasida yo'q; birida
 * davr saqlanadi, boshqasida yo'qoladi. Bitta panel — bitta xulq.
 *
 * ── NIMA SAQLANADI ──
 * Davr, filial va filtrlar — `baseFilters` orqali. Panel ularni
 * O'ZGARTIRMAYDI, faqat tugun filtrini USTIGA qo'shadi. Shuning
 * uchun ichkaridagi jami tashqaridagi raqamdan oshib ketmaydi.
 *
 * ── ZANJIR KO'RINIB TURADI ──
 * Yuqoridagi nom qatori butun yo'lni ko'rsatadi:
 *   Filial A › IELTS › A guruhi › Aziz
 * Har bo'g'in bosiladi — ya'ni "qayerdan keldim" savoli hech qachon
 * javobsiz qolmaydi.
 */

const Breadcrumb = ({ stack, onGo }) => (
  <nav className="flex flex-wrap items-center gap-0.5 text-xs" aria-label="Zanjir">
    {stack.map((node, i) => {
      const last = i === stack.length - 1;
      return (
        <span key={`${node.type}-${node.id}-${i}`} className="flex items-center gap-0.5">
          {i > 0 && <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />}
          <button
            type="button"
            onClick={() => !last && onGo(i)}
            disabled={last}
            className={cn(
              "max-w-[12rem] truncate rounded px-1 py-0.5",
              last
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {node.name || nodeLabel(node.type)}
          </button>
        </span>
      );
    })}
  </nav>
);

const DrillDrawer = () => {
  const { stack, current, baseFilters, isOpen, close, back, goTo, open } = useDrill();
  if (!current) return null;

  // Zanjirdagi HAR tugunning filtri qo'shiladi (meros).
  const filters = stackFilters(stack, baseFilters);
  const terminal = isTerminal(current.type);

  return (
    <Sheet open={isOpen} onOpenChange={(v) => !v && close()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            {stack.length > 1 && (
              <button
                type="button"
                onClick={back}
                aria-label="Orqaga"
                className="-ml-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base">
                {current.name || nodeLabel(current.type)}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {nodeLabel(current.type)} · tanlangan davr va filtrlar saqlangan
              </SheetDescription>
            </div>
          </div>

          {stack.length > 1 && (
            <div className="flex items-center gap-1 pt-1">
              <Home className="size-3 shrink-0 text-muted-foreground/60" />
              <Breadcrumb stack={stack} onGo={goTo} />
            </div>
          )}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {terminal ? (
            <TransactionDetail entryId={current.id} />
          ) : (
            <DrillSections node={current} filters={filters} onOpen={open} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DrillDrawer;
