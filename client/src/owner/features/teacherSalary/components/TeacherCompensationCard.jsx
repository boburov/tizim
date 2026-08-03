import { Wallet, Pencil, Plus, AlertTriangle } from "lucide-react";

import Button from "@/shared/components/ui/button/Button";
import Badge from "@/shared/components/ui/badge/Badge";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import CompensationSetModal from "./modals/CompensationSetModal";

import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";
import useCompensationQuery from "../hooks/useCompensationQuery";

import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { describeCompensation } from "../utils/compensation";
import { formatDateUz } from "@/shared/utils/formatDate";

/**
 * O'QITUVCHI PROFILIDAGI MAOSH KARTOCHKASI.
 *
 * Ikki savolga javob beradi:
 *   1. "Hozir qancha oladi?"  - amaldagi stavka
 *   2. "Qachondan beri?"      - stavka tarixi (oshirishlar ko'rinadi)
 *
 * STAVKASIZ HOLAT ATAYLAB KO'ZGA TASHLANADI: "keyinroq belgilayman" bilan
 * yaratilgan o'qituvchining maoshi 0 bo'lib hisoblanadi va bu jimgina
 * sodir bo'lsa oy oxirida ma'lum bo'lardi.
 */
const TeacherCompensationCard = ({ teacherId, hiredAt }) => {
  const { openModal } = useModal();
  const { has } = usePermissions();
  const { data, isLoading } = useCompensationQuery(teacherId);

  const canManage = has(PERMISSIONS.FINANCE_MANAGE);
  const active = data?.active || null;
  const history = data?.items || [];
  // Amaldagisidan tashqari yopilgan davrlar - "tarix" bo'limi.
  const past = history.filter((h) => h._id !== active?._id);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-muted-foreground" />
          <h2 className="font-medium">Maosh stavkasi</h2>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            {active && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  openModal(MODAL.TEACHER_COMPENSATION_SET, {
                    teacherId,
                    hiredAt,
                    active,
                    mode: "amend",
                  })
                }
              >
                <Pencil className="size-4" />
                Tuzatish
              </Button>
            )}
            <Button
              size="sm"
              variant={active ? "outline" : "default"}
              onClick={() =>
                openModal(MODAL.TEACHER_COMPENSATION_SET, {
                  teacherId,
                  hiredAt,
                  active,
                  mode: "set",
                })
              }
            >
              <Plus className="size-4" />
              {active ? "Yangi stavka" : "Maoshni belgilash"}
            </Button>
          </div>
        )}
      </div>

      <div className="px-4 py-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
        ) : active ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">
                {describeCompensation(active)}
              </span>
              <Badge variant="secondary">
                {formatDateUz(active.effectiveFrom)} dan
              </Badge>
            </div>
            {active.note && (
              <p className="mt-1 text-sm text-muted-foreground">{active.note}</p>
            )}
          </>
        ) : (
          <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
            <div className="text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Maosh stavkasi belgilanmagan
              </p>
              <p className="text-amber-700/90 dark:text-amber-200/80">
                Bu o'qituvchining maoshi <b>0</b> bo'lib hisoblanadi. Guruh
                darajasida alohida kelishuv bo'lmasa, stavkani belgilang.
              </p>
            </div>
          </div>
        )}

        {past.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Oldingi stavkalar
            </p>
            <ul className="space-y-1.5">
              {past.map((h) => (
                <li
                  key={h._id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span className="text-muted-foreground">
                    {describeCompensation(h)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateUz(h.effectiveFrom)}
                    {h.effectiveTo ? ` — ${formatDateUz(h.effectiveTo)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ModalWrapper
        name={MODAL.TEACHER_COMPENSATION_SET}
        title="Maosh stavkasi"
        className="max-w-lg"
      >
        <CompensationSetModal />
      </ModalWrapper>
    </div>
  );
};

export default TeacherCompensationCard;
