// React
import { useState } from "react";

// Router
import { Link } from "react-router-dom";

// Icons
import { BadgeCheck } from "lucide-react";

// Components
import {
  Sheet,
  SheetTitle,
  SheetHeader,
  SheetContent,
} from "@/shared/components/shadcn/sheet";
import ApprovalQuickRow from "./ApprovalQuickRow";
import ApprovalDetailSheet from "./ApprovalDetailSheet";

// Hooks
import usePermissions from "@/shared/hooks/usePermissions";
import useExpenseApprovalsQuery from "../hooks/useExpenseApprovalsQuery";
import usePendingApprovalsCount from "../hooks/usePendingApprovalsCount";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

const PANEL_PARAMS = { status: "pending", limit: 20, sort: "-createdAt" };

/**
 * Yonboshdan chiqadigan tasdiqlar paneli.
 *
 * Toast faqat SESSIYA DAVOMIDA kelgan yangi so'rovlarni ko'rsatadi -
 * bu panel esa butun kutilayotgan navbatni istalgan payt ochadi.
 */
const ApprovalsBell = ({ className = "" }) => {
  const { hasAny } = usePermissions();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  const canSee = hasAny([
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.APPROVALS_DECIDE_CONFIG,
  ]);

  // Sanoq DOIM yangilanib turadi (15s polling) - badge shu bilan ishlaydi.
  // Sidebar linkidagi belgi ham AYNAN shu query'dan oziqlanadi, ya'ni
  // ikkalasi hech qachon bir-biridan farq qilmaydi.
  const { data: count = 0 } = usePendingApprovalsCount({ enabled: canSee });

  // To'liq ro'yxat esa faqat panel ochilganda so'raladi.
  const { data, isLoading } = useExpenseApprovalsQuery(PANEL_PARAMS, {
    enabled: canSee && open,
  });

  if (!canSee) return null;

  const items = data?.data || [];
  const total = data?.meta?.total || 0;

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        {/* Tugma ko'rinishi bildirishnoma qo'ng'irog'i bilan bir xil:
            oq fon + chegara + doira. Yalang'och ikonka bosiladigan
            joyga o'xshamasdi. */}
        <button
          type="button"
          title="Tasdiqlar"
          onClick={() => setOpen(true)}
          aria-label={`Tasdiqlar (${count} ta kutilmoqda)`}
          className={`relative inline-flex size-9 shrink-0 items-center justify-center rounded-xl border bg-card transition hover:bg-muted ${className}`}
        >
          <BadgeCheck strokeWidth={1.5} className="size-5" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium leading-none text-white">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>

        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b p-4 text-left">
            <SheetTitle>Kutilayotgan tasdiqlar</SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {isLoading && (
              <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
            )}
            {!isLoading && items.length === 0 && (
              <p className="text-sm text-muted-foreground">Kutilayotgan so'rov yo'q</p>
            )}
            {items.map((a) => (
              <ApprovalQuickRow
                key={a._id}
                approval={a}
                onOpenDetail={setDetail}
              />
            ))}
          </div>

          {total > items.length && (
            <div className="border-t p-4">
              <Link
                to="/owner/expense-approvals"
                onClick={() => setOpen(false)}
                className="block rounded-md border py-2 text-center text-sm transition hover:bg-muted"
              >
                Barchasini ko'rish ({total})
              </Link>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ApprovalDetailSheet
        approval={detail}
        open={!!detail}
        onOpenChange={(v) => !v && setDetail(null)}
      />
    </>
  );
};

export default ApprovalsBell;
