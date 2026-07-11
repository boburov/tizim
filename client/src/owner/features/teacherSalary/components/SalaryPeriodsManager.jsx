import { Plus, Pencil, Trash2 } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUz } from "@/shared/utils/formatDate";
import {
  useTeacherPeriodsQuery,
  useTeacherPeriodRemoveMutation,
} from "@/owner/features/groups";
import SalaryPeriodFormModal from "./modals/SalaryPeriodFormModal";

const fmtDate = (v) => (v ? formatDateUz(v) : "hozir");
const rateText = (p) => {
  const type = p.salaryType || "fixed";
  const fixed = Number(p.fixedAmount) || 0;
  const pct = Number(p.percentRate) || 0;
  if (type === "percent") return `${pct}%`;
  if (type === "fixed") return formatMoney(fixed);
  return `${formatMoney(fixed)} + ${pct}%`;
};
const fullName = (t) => `${t?.firstName || ""} ${t?.lastName || ""}`.trim() || "-";

// Guruhdagi o'qituvchilarning maosh-davrlarini boshqaradi (o'qituvchi bo'yicha
// guruhlangan timeline). Qo'shish/tahrirlash alohida modallarda ochiladi.
const SalaryPeriodsManager = ({ groupId }) => {
  const { openModal } = useModal();
  const { data: periods = [], isLoading } = useTeacherPeriodsQuery(groupId);
  const removeMut = useTeacherPeriodRemoveMutation(groupId);

  const openAdd = () => openModal(MODAL.SALARY_PERIOD_CREATE, { groupId });
  const openEdit = (p) => openModal(MODAL.SALARY_PERIOD_EDIT, { groupId, period: p });

  // O'qituvchi bo'yicha guruhlash.
  const byTeacher = [];
  const idx = new Map();
  for (const p of periods) {
    const tid = String(p.teacher?._id || p.teacher);
    if (!idx.has(tid)) {
      idx.set(tid, byTeacher.length);
      byTeacher.push({ teacher: p.teacher, items: [] });
    }
    byTeacher[idx.get(tid)].items.push(p);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Maosh davrlari</span>
        <Button size="sm" onClick={openAdd}>
          <Plus className="size-4" />
          Davr qo'shish
        </Button>
      </div>

      {isLoading ? (
        <div className="p-4 text-center text-muted-foreground">Yuklanmoqda...</div>
      ) : byTeacher.length === 0 ? (
        <EmptyState
          title="Maosh davrlari yo'q"
          description="O'qituvchi qo'shib, ishlagan davri va maoshini belgilang."
        />
      ) : (
        <div className="space-y-4">
          {byTeacher.map(({ teacher, items }) => (
            <div key={String(teacher?._id || teacher)} className="rounded-lg border bg-white">
              <div className="border-b px-3 py-2 text-sm font-semibold">{fullName(teacher)}</div>
              <ul className="divide-y">
                {items.map((p) => (
                  <li key={p._id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="flex flex-col">
                      <span className="text-sm">
                        {fmtDate(p.startDate)} - {fmtDate(p.endDate)}
                      </span>
                      <span className="text-xs text-muted-foreground">{rateText(p)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {p.endDate == null && <StatusBadge tone="success">Aktiv</StatusBadge>}
                      <button type="button" onClick={() => openEdit(p)} aria-label="Tahrirlash">
                        <Pencil className="size-4 text-muted-foreground hover:text-foreground" />
                      </button>
                      <button
                        type="button"
                        disabled={removeMut.isPending}
                        onClick={() => removeMut.mutate(p._id)}
                        aria-label="O'chirish"
                      >
                        <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <ModalWrapper name={MODAL.SALARY_PERIOD_CREATE} title="Yangi maosh davri" className="max-w-md">
        <SalaryPeriodFormModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.SALARY_PERIOD_EDIT} title="Maosh davrini tahrirlash" className="max-w-md">
        <SalaryPeriodFormModal />
      </ModalWrapper>
    </div>
  );
};

export default SalaryPeriodsManager;
