// Icons
import { Building2, Layers, ChevronRight } from "lucide-react";

// Hooks
import useActiveBranch from "@/shared/hooks/useActiveBranch";

// Lib
import { ALL_BRANCHES } from "@/shared/lib/branch/activeBranch";

// Constants
import { APP_NAME, APP_LOGO } from "@/shared/constants/app";

/**
 * FILIAL TANLASH EKRANI (login'dan keyin).
 *
 * NEGA kerak: bir nechta filiali bor foydalanuvchi uchun "qaysi filialda
 * ishlayapman" degan savol har doim ochiq turmasligi kerak. Bu ekran uni
 * boshida hal qiladi - "hisobni almashtirish" his-tuyg'usini beradi.
 *
 * Bitta filiali borlar (odatdagi direktor) bu ekranni UMUMAN ko'rmaydi -
 * ular to'g'ridan-to'g'ri o'z filialiga tushadi.
 */
const BranchPicker = () => {
  const { branches, canSeeAllBranches, changeBranch } = useActiveBranch();

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <img
            src={APP_LOGO}
            alt={APP_NAME}
            width={48}
            height={48}
            className="size-12 mx-auto"
          />
          <h1 className="text-xl font-semibold">Filialni tanlang</h1>
          <p className="text-sm opacity-60">
            Tanlangan filial ma'lumotlari bilan ishlaysiz
          </p>
        </div>

        <div className="space-y-2">
          {/* Konsolidatsiya - faqat branches.view_all bilan */}
          {canSeeAllBranches && (
            <button
              type="button"
              onClick={() => changeBranch(ALL_BRANCHES)}
              className="w-full flex items-center gap-3 rounded-lg border bg-white p-4 text-left transition hover:border-primary hover:shadow-sm"
            >
              <div className="flex items-center justify-center size-10 shrink-0 rounded-md bg-primary/10 text-primary">
                <Layers size={20} strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">Barcha filiallar</p>
                <p className="text-xs opacity-60">
                  Hamma filial ma'lumoti birlashtirilgan holda
                </p>
              </div>
              <ChevronRight size={18} strokeWidth={1.5} className="opacity-40" />
            </button>
          )}

          {branches.map((b) => (
            <button
              key={b._id}
              type="button"
              onClick={() => changeBranch(b._id)}
              className="w-full flex items-center gap-3 rounded-lg border bg-white p-4 text-left transition hover:border-primary hover:shadow-sm"
            >
              <div className="flex items-center justify-center size-10 shrink-0 rounded-md bg-muted">
                <Building2 size={20} strokeWidth={1.5} />
              </div>
              <p className="flex-1 min-w-0 font-medium truncate">{b.name}</p>
              <ChevronRight size={18} strokeWidth={1.5} className="opacity-40" />
            </button>
          ))}
        </div>

        <p className="text-center text-xs opacity-50">
          Keyinroq yon panel orqali filialni almashtirishingiz mumkin
        </p>
      </div>
    </div>
  );
};

export default BranchPicker;
