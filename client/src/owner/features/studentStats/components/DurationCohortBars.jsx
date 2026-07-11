import Card from "@/shared/components/ui/card/Card";
import { TabsButtons } from "@/shared/components/ui/tabs/Tabs";

// Har bir kohorta uchun rang (0-3 → ... → 1 yil+).
const TONES = {
  "0-3": "bg-sky-500",
  "3-6": "bg-indigo-500",
  "6-12": "bg-violet-500",
  "12+": "bg-emerald-500",
};

// Rejim almashtirgich: hozir o'qiyotganlar (enrolledAt → bugun) yoki
// yakunlaganlar (enrolledAt → yakunlash sanasi, muzlatilgan).
const MODE_ITEMS = [
  { value: "ongoing", label: "Hozir o'qiyotganlar" },
  { value: "finished", label: "Yakunlaganlar" },
];

// O'quvchilarni ro'yxatda turgan muddati bo'yicha guruhlash - gorizontal bar'lar.
// Muddat ro'yxatga olingan sanadan (enrolledAt) hisoblanadi, guruhga qo'shilgan
// sanadan emas.
const DurationCohortBars = ({ cohorts = [], mode = "ongoing", onModeChange }) => {
  const total = cohorts.reduce((s, c) => s + (c.count || 0), 0);

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <h2 className="font-semibold text-gray-900">
          Ro'yxatda turgan muddat bo'yicha taqsimot
        </h2>
        <TabsButtons items={MODE_ITEMS} value={mode} onChange={onModeChange} />
      </div>
      {total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Ma'lumot yo'q
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {cohorts.map((c) => {
            const pct = total ? Math.round((c.count / total) * 100) : 0;
            return (
              <div key={c.key} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground/90">
                    {c.label}
                  </span>
                  <span className="text-muted-foreground">
                    {c.count} ta
                    <span className="ml-1.5 text-xs text-zinc-400">{pct}%</span>
                  </span>
                </div>
                <div className="relative h-2.5 flex-1 overflow-hidden rounded bg-zinc-100">
                  <div
                    className={`absolute inset-y-0 left-0 rounded ${TONES[c.key] || "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default DurationCohortBars;
