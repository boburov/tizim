import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/shared/components/shadcn/sheet";
import MetricValue from "./MetricValue";
import ComparisonBadge from "./ComparisonBadge";
import AnalyticsTable from "./AnalyticsTable";
import { QueryState } from "./StateBlock";
import targetFilter from "../utils/targetFilter";
import {
  useGroupProfit, useRevenueBy, useReceivablesBy, useEntryList,
} from "../hooks/useFinanceAnalytics";

/**
 * DRILL-DOWN PANELI — "bu raqam nimadan iborat?"
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA PANEL, YANGI SAHIFA EMAS
 *
 * Foydalanuvchi tanlagan davr, filial va filtrlar — bu KONTEKST.
 * Yangi sahifaga o'tilsa u kontekst ekrandan yo'qoladi va qaytib
 * kelganda qayerda edim degan savol tug'iladi. Panel esa ustiga
 * ochiladi: orqa fonda o'sha jadval turadi.
 *
 * ── HAMMA RAQAM SERVERDAN ──
 * Panel mavjud tahlil endpoint'larini FILTR bilan qayta chaqiradi
 * (masalan `courseId` qo'shib). Ya'ni "yo'nalish ichidagi guruhlar"
 * jamisi tashqi jadvaldagi yo'nalish raqami bilan MOS keladi —
 * ikkalasi ham bir xil manbadan.
 * ═══════════════════════════════════════════════════════════════════
 */

const TITLES = {
  teacher: "O'qituvchi",
  course: "Yo'nalish",
  group: "Guruh",
  room: "Xona",
  student: "O'quvchi",
  expenseCategory: "Chiqim kategoriyasi",
  paymentMethod: "To'lov kanali",
};

const DrillDownDrawer = ({ target, filters, onOpenChange, onDrill, onOpenEntry }) => {
  const open = Boolean(target);
  const scoped = { ...filters, ...targetFilter(target) };

  // YOZUVLAR — zanjirning oxirgi bo'g'ini. Faqat eng chuqur
  // darajalarda so'raladi: yuqori darajada ular yuzlab bo'lardi va
  // hech qanday savolga javob bermasdi.
  const deepest = ["group", "student", "expenseCategory", "room", "paymentMethod"].includes(target?.type);
  const entries = useEntryList({ ...scoped, limit: 25 }, { enabled: open && deepest });

  // Guruhlar — o'qituvchi va yo'nalish uchun keyingi daraja.
  const showGroups = target?.type === "teacher" || target?.type === "course";
  const groups = useGroupProfit(scoped, { enabled: open && showGroups });

  // Guruh ichida — o'quvchilar qarzi (keyingi daraja).
  const students = useReceivablesBy("student", scoped, {
    enabled: open && target?.type === "group",
  });

  // Xona ichida — qaysi guruhlar daromad keltirgan.
  const roomGroups = useRevenueBy("group", scoped, {
    enabled: open && target?.type === "room",
  });

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onOpenChange(null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{target?.name || "—"}</SheetTitle>
          <SheetDescription>
            {TITLES[target?.type] || "Tafsilot"} · tanlangan davr va filtrlar saqlangan
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {showGroups && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-foreground">Guruhlar</h3>
              <QueryState
                query={groups}
                empty={!groups.data?.items?.length}
                emptyTitle="Bu kesimda guruh topilmadi"
                loadingRows={2}
              >
                {(d) => (
                  <AnalyticsTable
                    rows={d.items}
                    rowKey={(r) => r.groupId}
                    defaultSort={{ key: "contributionProfit", dir: "desc" }}
                    onRowClick={(r) => onDrill?.({ type: "group", id: r.groupId, name: r.name })}
                    columns={[
                      { key: "name", label: "Guruh" },
                      { key: "students", label: "O'quvchi", align: "right", kind: "number" },
                      { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                      { key: "contributionProfit", label: "Hissa foydasi", align: "right", kind: "moneyShort" },
                      { key: "outstanding", label: "Qarz", align: "right", kind: "moneyShort" },
                    ]}
                  />
                )}
              </QueryState>
            </section>
          )}

          {target?.type === "group" && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-foreground">O'quvchilar qarzi</h3>
              <QueryState
                query={students}
                empty={!students.data?.length}
                emptyTitle="Bu guruhda qarzdor yo'q"
                loadingRows={2}
              >
                {(rows) => (
                  <AnalyticsTable
                    rows={rows}
                    defaultSort={{ key: "outstanding", dir: "desc" }}
                    columns={[
                      { key: "name", label: "O'quvchi" },
                      { key: "expected", label: "Kutilgan", align: "right", kind: "moneyShort" },
                      { key: "collected", label: "To'langan", align: "right", kind: "moneyShort" },
                      { key: "outstanding", label: "Qarz", align: "right", kind: "moneyShort" },
                    ]}
                  />
                )}
              </QueryState>
            </section>
          )}

          {target?.type === "room" && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-foreground">Xonadagi guruhlar</h3>
              <QueryState
                query={roomGroups}
                empty={!roomGroups.data?.length}
                emptyTitle="Bu xonada daromad yozuvi yo'q"
                loadingRows={2}
              >
                {(rows) => (
                  <AnalyticsTable
                    rows={rows}
                    defaultSort={{ key: "revenue", dir: "desc" }}
                    columns={[
                      { key: "name", label: "Guruh" },
                      { key: "revenue", label: "Daromad", align: "right", kind: "moneyShort" },
                      { key: "sharePercent", label: "Ulush", align: "right", kind: "percent" },
                    ]}
                  />
                )}
              </QueryState>
            </section>
          )}

          {/* ── YOZUVLAR: bu yerdan tranzaksiya paneliga o'tiladi ── */}
          {deepest && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-foreground">Moliyaviy yozuvlar</h3>
              <QueryState
                query={entries}
                empty={!entries.data?.length}
                emptyTitle="Bu kesimda yozuv yo'q"
                loadingRows={2}
              >
                {(rows) => (
                  <AnalyticsTable
                    rows={rows}
                    defaultSort={{ key: "date", dir: "desc" }}
                    onRowClick={(r) => onOpenEntry?.(r.id)}
                    columns={[
                      {
                        key: "date", label: "Sana",
                        render: (r) => new Date(r.date).toLocaleDateString("uz-UZ"),
                      },
                      { key: "kindLabel", label: "Turi" },
                      { key: "amount", label: "Summa", align: "right", kind: "moneyShort" },
                      { key: "memo", label: "Izoh", sortable: false },
                    ]}
                  />
                )}
              </QueryState>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Qatorni bosing — qo'sh yozuv, audit va manba hujjat ko'rinadi.
              </p>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DrillDownDrawer;
