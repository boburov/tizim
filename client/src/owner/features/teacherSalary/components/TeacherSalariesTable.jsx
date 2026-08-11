import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Minus, Trash2 } from "lucide-react";
import DataTable from "@/shared/components/ui/table/DataTable";
import Button from "@/shared/components/ui/button/Button";
import { formatMoney } from "@/shared/utils/formatMoney";
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";
import {
  SALARY_TYPE_LABEL,
  SALARY_KIND_LABEL,
  isAdjustmentKind,
} from "../utils/status";
import { useRemoveSalaryAdjustmentMutation } from "../hooks/useSalaryMutations";

const headerCls = "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground";
const headerRightCls = "px-4 py-2.5 text-right text-xs font-medium text-muted-foreground";

// Maosh bo'yicha hisob-kitob (progress, qoldiq, status rangi).
const calc = (s) => {
  const expected = s.expectedAmount || 0;
  const paid = s.paidAmount || 0;
  const remaining = Math.max(0, expected - paid);
  const pct =
    expected > 0 ? Math.min(100, Math.round((paid / expected) * 100)) : paid > 0 ? 100 : 0;
  const barColor =
    s.status === "paid" ? "bg-emerald-500" : s.status === "partial" ? "bg-amber-500" : "bg-rose-400";
  return { expected, paid, remaining, pct, barColor };
};

const ProgressBar = ({ pct, barColor }) => (
  <div className="flex min-w-[100px] items-center gap-2">
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
    <span className="w-9 shrink-0 text-right text-xs font-medium text-muted-foreground">{pct}%</span>
  </div>
);

const NameLink = ({ salary }) => (
  <div className="min-w-0">
    <Link
      to={`/owner/finance/teacher-salaries/teacher/${salary.teacher?._id}`}
      className="font-medium text-foreground hover:underline"
    >
      {salary.teacher?.firstName} {salary.teacher?.lastName}
    </Link>
    {/* Qo'lda yozilgan qatorda "Fiksa/Foiz" ma'nosiz - u stavkadan
        kelib chiqmagan. O'rniga qator turi ko'rsatiladi. */}
    {isAdjustmentKind(salary.kind) ? (
      <p className="text-xs font-medium text-muted-foreground">
        {SALARY_KIND_LABEL[salary.kind]}
      </p>
    ) : (
      SALARY_TYPE_LABEL[salary.salaryType] && (
        <p className="text-xs text-muted-foreground">{SALARY_TYPE_LABEL[salary.salaryType]}</p>
      )
    )}
  </div>
);

// Ikkinchi ustun: guruh qatorida guruh nomi, mukofot/jarimada esa SABAB.
// Sababsiz jarima auditda yaroqsiz, shuning uchun u ro'yxatdayoq ko'rinadi.
const ContextCell = ({ salary }) =>
  isAdjustmentKind(salary.kind) ? (
    <span className="text-sm text-muted-foreground">{salary.reason || "-"}</span>
  ) : (
    <>{salary.group?.name || "-"}</>
  );

const TeacherSalariesTable = ({ rows = [], isLoading }) => {
  const { openModal } = useModal();
  const { has } = usePermissions();
  const canManage = has(PERMISSIONS.FINANCE_MANAGE);
  // Inline tasdiq: qaysi qator o'chirishga tasdiq kutmoqda.
  const [confirmId, setConfirmId] = useState(null);
  const removeMut = useRemoveSalaryAdjustmentMutation({
    onSuccess: () => setConfirmId(null),
    onError: () => setConfirmId(null),
  });

  const Actions = ({ salary }) => {
    // MUKOFOT/JARIMA qatorida "To'lov" tugmasi KO'RSATILMAYDI: jarimaning
    // summasi manfiy, ya'ni to'lanadigan qoldiq yo'q - tugma bosilsa
    // "To'liq berilgan" deb o'chib turardi va foydalanuvchini chalg'itardi.
    // O'rniga xatoni qaytarish yo'li beriladi.
    if (isAdjustmentKind(salary.kind)) {
      if (!canManage) return null;
      return confirmId === salary._id ? (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="danger"
            disabled={removeMut.isPending}
            onClick={() => removeMut.mutate(salary._id)}
          >
            {removeMut.isPending ? "..." : "O'chirish"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={removeMut.isPending}
            onClick={() => setConfirmId(null)}
          >
            Yo'q
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmId(salary._id)}
            aria-label="O'chirish"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      );
    }

    return (
      <div className="flex justify-end gap-1">
        {canManage && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              openModal(MODAL.SALARY_ADJUSTMENT, {
                teacher: salary.teacher,
                group: salary.group,
                year: salary.year,
                month: salary.month,
                kind: "deduction",
              })
            }
          >
            <Minus className="size-4" />
            Jarima
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => openModal(MODAL.SALARY_ADD_PAYOUT, { salary })}
        >
          <Plus className="size-4" />
          To'lov
        </Button>
      </div>
    );
  };

  const columns = [
    {
      key: "name",
      header: "Ism familiya",
      headerClassName: headerCls,
      cell: (r) => <NameLink salary={r} />,
    },
    {
      key: "group",
      header: "Guruh / sabab",
      headerClassName: headerCls,
      cell: (r) => <ContextCell salary={r} />,
    },
    {
      key: "progress",
      header: "Progress",
      headerClassName: headerCls,
      cell: (r) => {
        // Jarima/mukofotda progress ma'nosiz: jarimada to'lanadigan summa
        // yo'q, mukofot esa asosiy qator bilan birga to'lanadi.
        if (isAdjustmentKind(r.kind)) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        const { pct, barColor } = calc(r);
        return <ProgressBar pct={pct} barColor={barColor} />;
      },
    },
    {
      key: "expected",
      header: "To'lanishi kerak",
      headerClassName: headerCls,
      cell: (r) => {
        const { expected } = calc(r);
        // Jarima MANFIY - ishorasi bilan va qizil ko'rsatiladi, aks holda
        // "200 000" yozuvi mukofotdan farq qilmasdi.
        return expected < 0 ? (
          <span className="font-medium text-rose-600 dark:text-rose-300">
            −{formatMoney(Math.abs(expected))}
          </span>
        ) : (
          formatMoney(expected)
        );
      },
    },
    {
      key: "paid",
      header: "To'langan",
      headerClassName: headerCls,
      cell: (r) => <span className="text-emerald-600 dark:text-emerald-300">{formatMoney(calc(r).paid)}</span>,
    },
    {
      key: "remaining",
      header: "To'lanmagan",
      headerClassName: headerCls,
      cell: (r) => {
        const { remaining } = calc(r);
        return (
          <span className={remaining > 0 ? "font-semibold text-rose-600 dark:text-rose-300" : "text-muted-foreground"}>
            {formatMoney(remaining)}
          </span>
        );
      },
    },
    {
      key: "action",
      header: "Amallar",
      headerClassName: headerRightCls,
      className: "text-right",
      cell: (r) => <Actions salary={r} />,
    },
  ];

  const renderCard = (r) => {
    const { expected, paid, remaining, pct, barColor } = calc(r);
    const adjustment = isAdjustmentKind(r.kind);
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <NameLink salary={r} />
          <Actions salary={r} />
        </div>
        <p className="text-xs text-muted-foreground">
          {adjustment ? r.reason || "-" : r.group?.name}
        </p>
        {!adjustment && <ProgressBar pct={pct} barColor={barColor} />}
        <div className="flex flex-wrap justify-between gap-x-3 text-xs">
          <span className={expected < 0 ? "text-rose-600 dark:text-rose-300" : "text-muted-foreground"}>
            Kerak: {expected < 0 ? `−${formatMoney(Math.abs(expected))}` : formatMoney(expected)}
          </span>
          <span className="text-emerald-600 dark:text-emerald-300">To'langan: {formatMoney(paid)}</span>
          <span className={remaining > 0 ? "text-rose-600 dark:text-rose-300" : "text-muted-foreground"}>
            To'lanmagan: {formatMoney(remaining)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      isLoading={isLoading}
      rowKey={(r) => r._id}
      renderCard={renderCard}
    />
  );
};

export default TeacherSalariesTable;
