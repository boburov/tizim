// React
import { useState } from "react";

// Icons
import { Phone, GripVertical } from "lucide-react";

// Hooks
import { useLeadUpdateMutation } from "../hooks/useLeadMutations";

// Constants
import {
  LEAD_PIPELINE,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_TONE,
} from "@/shared/constants/leadStatus";

// Utils
import { formatPhone } from "@/shared/utils/formatPhone";

/**
 * LID KANBAN DOSKASI.
 *
 * ── NEGA FAQAT VORONKA BOSQICHLARI ──
 * Ustunlar `LEAD_PIPELINE` dan olinadi, `LEAD_STATUSES` dan EMAS.
 * "Rad etildi" va "Qayta bog'lanildi" chiziqli bosqich emas - ular
 * voronkadan CHIQISH va unga QAYTISH. Ularni ustun qilsak doska
 * "keyingi bosqichga sur" mantiqini yo'qotardi va rad etilganlar
 * ekranning yarmini egallab olardi.
 *
 * Rad etilgan lidlar jadval ko'rinishida qoladi (filtr bilan).
 *
 * ── NEGA HTML5 DRAG, KUTUBXONA EMAS ──
 * Bu doskada bitta ish bor: kartani ustundan ustunga surish. Buning
 * uchun yangi bog'liqlik (dnd-kit ~40kb) qo'shish narxi foydasidan
 * yuqori. Native `draggable` klaviatura bilan ishlamaydi - shuning
 * uchun har kartada status tanlagich HAM bor (pastda), ya'ni doska
 * sichqonchasiz ham to'liq ishlaydi.
 */
const LeadKanban = ({ leads = [], isLoading }) => {
  const [dragId, setDragId] = useState(null);
  const [overColumn, setOverColumn] = useState(null);

  const update = useLeadUpdateMutation();

  const move = (leadId, status) => {
    const lead = leads.find((l) => String(l._id) === String(leadId));
    // Bir xil ustunga tashlansa - so'rov yubormaymiz (bekorga yozuv
    // va statusHistory'da soxta qator paydo bo'lardi).
    if (!lead || lead.status === status) return;
    update.mutate({ id: leadId, body: { status } });
  };

  const byStatus = LEAD_PIPELINE.reduce((acc, s) => {
    acc[s] = leads.filter((l) => l.status === s);
    return acc;
  }, {});

  if (isLoading) {
    return <p className="py-8 text-center text-sm opacity-60">Yuklanmoqda...</p>;
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {LEAD_PIPELINE.map((status) => {
          const items = byStatus[status] || [];
          const isOver = overColumn === status;

          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setOverColumn(status);
              }}
              onDragLeave={() => setOverColumn((c) => (c === status ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setOverColumn(null);
                if (dragId) move(dragId, status);
                setDragId(null);
              }}
              className={`w-[260px] shrink-0 rounded-lg border p-2 transition-colors ${
                isOver
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/40"
              }`}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    LEAD_STATUS_TONE[status]
                  }`}
                >
                  {LEAD_STATUS_LABEL[status]}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </div>

              <div className="space-y-2">
                {items.length === 0 && (
                  <p className="px-1 py-6 text-center text-xs opacity-50">
                    Bo'sh
                  </p>
                )}

                {items.map((lead) => (
                  <div
                    key={lead._id}
                    draggable
                    onDragStart={() => setDragId(String(lead._id))}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverColumn(null);
                    }}
                    className={`rounded-md border border-border bg-card p-2.5 ${
                      String(dragId) === String(lead._id) ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-start gap-1.5">
                      <GripVertical
                        size={14}
                        strokeWidth={2}
                        className="mt-0.5 shrink-0 cursor-grab text-muted-foreground"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {lead.firstName} {lead.lastName || ""}
                        </p>
                        {lead.phone && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone size={11} strokeWidth={2} />
                            {formatPhone(lead.phone)}
                          </p>
                        )}
                        {lead.assignedTo && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {lead.assignedTo.firstName} {lead.assignedTo.lastName || ""}
                          </p>
                        )}

                        {/* KLAVIATURA YO'LI: native drag klaviatura bilan
                            ishlamaydi, shuning uchun har kartada tanlagich
                            ham bor - doska sichqonchasiz to'liq ishlaydi. */}
                        <select
                          value={lead.status}
                          disabled={update.isPending}
                          onChange={(e) => move(lead._id, e.target.value)}
                          aria-label="Bosqichni o'zgartirish"
                          className="mt-1.5 w-full rounded border border-border bg-card px-1 py-0.5 text-xs"
                        >
                          {LEAD_PIPELINE.map((s) => (
                            <option key={s} value={s}>
                              {LEAD_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LeadKanban;
