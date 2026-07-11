// State
import { useMemo, useState } from "react";

// Icons
import { CalendarOff, Users, Check } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import Badge from "@/shared/components/ui/badge/Badge";
import ScoreButtons from "./ScoreButtons";

// Utils
import { cn } from "@/shared/utils/cn";
import { formatPhone } from "@/shared/utils/formatPhone";
import { MAX_GRADE } from "@/shared/helpers/grade.helpers";
import { loadGradingSettings } from "../utils/gradingSettings";

const QUICK_SCALE = Array.from({ length: MAX_GRADE }, (_, i) => i + 1);

// data: { rows: [{ student, grade }], isClassDay }, onSubmit(items), isSubmitting
const GradeGrid = ({ data, onSubmit, isSubmitting }) => {
  const { gradeLabels } = loadGradingSettings();

  // Server ma'lumotidan boshlang'ich ballar (student._id -> value|null)
  const initial = useMemo(() => {
    const init = {};
    for (const r of data?.rows || []) {
      init[String(r.student._id)] = r.grade ? r.grade.value : null;
    }
    return init;
  }, [data]);

  // Render paytida hosil qilingan state'ni "reset on change" bilan boshqaramiz
  // (effect ichida setState chaqirmaslik - React tavsiyasi).
  const [state, setState] = useState(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setState(initial);
  }

  if (!data) return null;

  const rows = data.rows || [];
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-white p-10 text-center">
        <Users className="mx-auto size-8 text-gray-300" />
        <p className="mt-2 text-sm text-muted-foreground">
          Bu sanaga aktiv o'quvchilar yo'q.
        </p>
      </div>
    );
  }

  const locked = !data.isClassDay;

  // Statistika
  const total = rows.length;
  const gradedCount = rows.reduce(
    (acc, r) => (state[String(r.student._id)] != null ? acc + 1 : acc),
    0,
  );
  const dirtyCount = rows.reduce((acc, r) => {
    const sid = String(r.student._id);
    const orig = r.grade ? r.grade.value : null;
    return state[sid] !== orig ? acc + 1 : acc;
  }, 0);
  const progressPct = total > 0 ? Math.round((gradedCount / total) * 100) : 0;

  const setAll = (n) => {
    setState((prev) => {
      const next = { ...prev };
      for (const r of rows) next[String(r.student._id)] = n;
      return next;
    });
  };

  const handleSubmit = () => {
    const items = [];
    for (const r of rows) {
      const sid = String(r.student._id);
      const val = state[sid];
      if (val == null) continue; // ball qo'yilmagan - yubormaymiz
      const orig = r.grade ? r.grade.value : null;
      if (val === orig) continue; // o'zgarmagan
      items.push({ studentId: sid, value: val });
    }
    if (items.length === 0) return;
    onSubmit(items);
  };

  const SaveButton = (
    <Button
      onClick={handleSubmit}
      disabled={isSubmitting || locked || dirtyCount === 0}
    >
      {isSubmitting ? "Saqlanmoqda..." : "Saqlash"}
    </Button>
  );

  return (
    <div className="space-y-3 pb-20">
      {locked && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
          <CalendarOff className="size-4 shrink-0" />
          Bu kun guruh jadvalida dars kuni emas. Baho faqat dars kunlari
          qo'yiladi.
        </div>
      )}

      {/* Progress + action panel (yuqorida sticky) */}
      <div className="sticky top-0 z-20 space-y-2.5 border-b border-gray-200 bg-background/85 py-3 backdrop-blur-sm">
        {/* Progress */}
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">
              {total} tadan {gradedCount} ta baholandi
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {progressPct}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                progressPct === 100 ? "bg-green-500" : "bg-primary",
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Hammaga tez-baholash + saqlash */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Hammaga:</span>
            <div className="flex items-center gap-1">
              {QUICK_SCALE.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={locked || isSubmitting}
                  onClick={() => setAll(n)}
                  title={gradeLabels[n] ? `${n} - ${gradeLabels[n]}` : `Ball ${n}`}
                  className={cn(
                    "size-7 rounded border border-gray-200 bg-white text-xs font-semibold text-gray-500 transition",
                    "hover:border-primary/40 hover:bg-primary/5 hover:text-primary",
                    "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dirtyCount > 0 && (
              <Badge variant="outline" className="text-amber-600">
                {dirtyCount} ta o'zgartirish
              </Badge>
            )}
            {SaveButton}
          </div>
        </div>
      </div>

      {/* Rows */}
      <div className="overflow-hidden rounded-md border bg-white">
        <div className="divide-y divide-gray-100 text-sm">
          {rows.map((r, i) => {
            const sid = String(r.student._id);
            const orig = r.grade ? r.grade.value : null;
            const isDirty = state[sid] !== orig;
            const isGraded = state[sid] != null;
            return (
              <div
                key={sid}
                className={cn(
                  "flex flex-col gap-3 p-3 transition-colors sm:flex-row sm:items-center sm:justify-between",
                  isDirty && "bg-amber-50/60",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid w-6 shrink-0 place-items-center text-xs text-muted-foreground">
                    {isGraded ? (
                      <Check
                        className={cn(
                          "size-4",
                          isDirty ? "text-amber-500" : "text-green-500",
                        )}
                      />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">
                      {r.student.firstName} {r.student.lastName}
                      {isDirty && (
                        <span className="ml-2 text-xs font-normal text-amber-600">
                          • saqlanmagan
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPhone(r.student.phone) || "-"}
                    </p>
                  </div>
                </div>
                <ScoreButtons
                  value={state[sid] ?? null}
                  onChange={(n) =>
                    setState((prev) => ({ ...prev, [sid]: n }))
                  }
                  disabled={locked || isSubmitting}
                  labels={gradeLabels}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Pastki sticky saqlash (mobil/uzun ro'yxat uchun) */}
      {dirtyCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/90 p-3 backdrop-blur-sm sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-amber-600">
              {dirtyCount} ta o'zgartirish
            </span>
            {SaveButton}
          </div>
        </div>
      )}
    </div>
  );
};

export default GradeGrid;
