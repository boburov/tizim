import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { Plus, Pencil } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import BackLink from "@/shared/components/ui/link/BackLink";
import Card from "@/shared/components/ui/card/Card";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { formatMoney } from "@/shared/utils/formatMoney";
import { MONTH_LABELS } from "@/shared/constants/calendar";
import GroupFeeEditModal from "../components/modals/GroupFeeEditModal";
import useGroupFeesByGroupQuery from "../hooks/useGroupFeesByGroupQuery";

const GroupFeeDetailPage = () => {
  const { groupId } = useParams();
  const { openModal } = useModal();
  const { data, isLoading } = useGroupFeesByGroupQuery(groupId);

  const group = data?.group;
  const fees = data?.fees || [];

  // To'lovlarni yil bo'yicha guruhlaymiz - har yil alohida cardda (yangi yil yuqorida,
  // ichida oylar kamayish tartibida).
  const feesByYear = useMemo(() => {
    const map = new Map();
    for (const fee of fees) {
      if (!map.has(fee.year)) map.set(fee.year, []);
      map.get(fee.year).push(fee);
    }
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, items]) => [year, items.sort((x, y) => y.month - x.month)]);
  }, [fees]);

  const openEdit = (fee) =>
    openModal(MODAL.GROUP_FEE_EDIT, {
      groupId,
      groupName: group?.name,
      year: fee?.year,
      month: fee?.month,
      amount: fee?.amount,
      lockPeriod: !!fee,
    });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackLink to="/owner/finance/group-fees" />
          <div>
            <h1 className="text-2xl font-semibold">{group?.name || "Guruh to'lovi"}</h1>
          </div>
        </div>
        <Button onClick={() => openEdit(null)}>
          <Plus className="size-4" />
          Boshqa oy uchun belgilash
        </Button>
      </header>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Yuklanmoqda...</div>
      ) : fees.length === 0 ? (
        <EmptyState title="To'lovlar belgilanmagan" />
      ) : (
        <div className="space-y-4">
          {feesByYear.map(([year, items]) => (
            <Card key={year} title={`${year}-yil`}>
              <ul className="mt-3 divide-y">
                {items.map((fee) => (
                  <li
                    key={fee._id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{MONTH_LABELS[fee.month - 1]}</span>
                      <StatusBadge tone={fee.source === "manual" ? "info" : "neutral"}>
                        {fee.source === "manual" ? "Qo'lda" : "Avto"}
                      </StatusBadge>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-semibold">{formatMoney(fee.amount)}</span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(fee)}
                        aria-label="Tahrirlash"
                      >
                        <Pencil className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <ModalWrapper name={MODAL.GROUP_FEE_EDIT} title="Guruh to'lovini belgilash">
        <GroupFeeEditModal />
      </ModalWrapper>
    </div>
  );
};

export default GroupFeeDetailPage;
