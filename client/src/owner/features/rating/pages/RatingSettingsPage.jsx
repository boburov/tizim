import { useMemo, useState } from "react";

// Icons
import {
  Scale,
  Palette,
  Trophy,
  Bot,
  RotateCcw,
  Loader2,
} from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import Switch from "@/shared/components/ui/switch/Switch";
import Select from "@/shared/components/ui/select/Select";
import { Skeleton } from "@/shared/components/shadcn/skeleton";
import {
  WeightSlider,
  ScoreButtons,
  SettingsSection,
  SettingRow,
} from "@/owner/features/grades";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import useRatingSettingsQuery from "../hooks/useRatingSettingsQuery";
import useRatingSettingsMutation from "../hooks/useRatingSettingsMutation";

// Utils / data
import { cn } from "@/shared/utils/cn";
import { getGradeToken, MAX_GRADE } from "@/shared/helpers/grade.helpers";
import {
  DEFAULT_GRADING_SETTINGS,
  RATING_PERIODS,
  TOP_N_OPTIONS,
  loadGradingSettings,
  saveGradingSettings,
} from "@/owner/features/grades/utils/gradingSettings";
import { toast } from "sonner";

const SCALE = Array.from({ length: MAX_GRADE }, (_, i) => i + 1);

const RatingSettingsPage = () => {
  const { data, isLoading } = useRatingSettingsQuery();
  const { mutate, isPending } = useRatingSettingsMutation();

  // Bitta forma state: serverdagi vaznlar (%) + localStorage sozlamalari.
  const form = useObjectState({
    gradePct: 70,
    attPct: 30,
    ...loadGradingSettings(),
  });
  const {
    gradePct,
    attPct,
    gradeLabels,
    ratingPeriod,
    ratingTopN,
    countLateAsAbsent,
    autoRemindUngraded,
    notifyParents,
    notifyStudents,
    setField,
    setFields,
  } = form;

  // Server vaznlari kelganda formani bir marta to'ldiramiz (render paytida).
  const [lastData, setLastData] = useState(null);
  if (data && data !== lastData) {
    setLastData(data);
    setFields({
      gradePct: Math.round((data.gradeWeight ?? 0.7) * 100),
      attPct: Math.round((data.attendanceWeight ?? 0.3) * 100),
    });
  }

  // "Saqlangan" tasvir - dirty hisoblash uchun (server + localStorage).
  const savedSnapshot = useMemo(() => {
    const ls = loadGradingSettings();
    return {
      gradePct: Math.round((data?.gradeWeight ?? 0.7) * 100),
      attPct: Math.round((data?.attendanceWeight ?? 0.3) * 100),
      ...ls,
    };
    // data o'zgarganda qayta hisoblanadi
  }, [data]);

  const current = {
    gradePct,
    attPct,
    gradeLabels,
    ratingPeriod,
    ratingTopN,
    countLateAsAbsent,
    autoRemindUngraded,
    notifyParents,
    notifyStudents,
  };
  const isDirty =
    JSON.stringify(current) !== JSON.stringify(savedSnapshot);

  const total = Number(gradePct) + Number(attPct);
  const weightsValid = total === 100;

  const handleSave = () => {
    if (!weightsValid) {
      toast.error("Vaznlar yig'indisi 100% bo'lishi kerak");
      return;
    }
    // Frontend-only sozlamalarni localStorage'ga
    saveGradingSettings({
      gradeLabels,
      ratingPeriod,
      ratingTopN,
      countLateAsAbsent,
      autoRemindUngraded,
      notifyParents,
      notifyStudents,
    });
    // Vaznlarni serverga (mavjud backend) - toast mutation ichida
    mutate({
      gradeWeight: Number(gradePct) / 100,
      attendanceWeight: Number(attPct) / 100,
    });
  };

  const handleReset = () => {
    setFields({
      gradePct: 70,
      attPct: 30,
      ...structuredClone(DEFAULT_GRADING_SETTINGS),
    });
    toast.info("Default qiymatlar tiklandi. Saqlashni unutmang.");
  };

  if (isLoading) return <SettingsSkeleton />;

  return (
    <div className="space-y-4 pb-24">
      {/* Sarlavha + saqlash paneli (sticky) */}
      <div className="sticky top-0 z-30 -mx-4 flex flex-col gap-3 border-b border-gray-100 bg-background/80 px-4 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Baholash sozlamalari</h1>
          {isDirty && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-amber-600">
              <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
              Saqlanmagan o'zgarishlar bor
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={isPending}
          >
            <RotateCcw className="size-4" />
            Tiklash
          </Button>
          <Button onClick={handleSave} disabled={isPending || !isDirty}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {isPending ? "Saqlanmoqda..." : "Saqlash"}
          </Button>
        </div>
      </div>

      {/* 1) Vazn balansi */}
      <SettingsSection
        icon={Scale}
        title="Vazn balansi"
        description="Reyting balli ikki qismdan iborat: o'rtacha baho va davomat foizi. Yig'indisi 100% bo'lishi kerak."
      >
        <WeightSlider
          grade={Number(gradePct)}
          attendance={Number(attPct)}
          onChange={(g, a) => setFields({ gradePct: g, attPct: a })}
          disabled={isPending}
        />
      </SettingsSection>

      {/* 2) Baho shkalasi */}
      <SettingsSection
        icon={Palette}
        title="Baho shkalasi"
        description="5 ballik tizim. Har bir bahoning rangi va nomini bu yerdan sozlang - ranglar butun modul bo'ylab bir xil ishlatiladi."
      >
        <div className="space-y-2.5">
          {SCALE.slice()
            .reverse()
            .map((n) => {
              const token = getGradeToken(n);
              return (
                <div
                  key={n}
                  className="flex items-center gap-3 rounded-md border border-gray-100 bg-gray-50/50 p-2.5"
                >
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-md border text-sm font-bold",
                      token.solid,
                    )}
                  >
                    {n}
                  </span>
                  <input
                    type="text"
                    value={gradeLabels[n] ?? ""}
                    maxLength={24}
                    onChange={(e) =>
                      setField("gradeLabels", {
                        ...gradeLabels,
                        [n]: e.target.value,
                      })
                    }
                    placeholder={`Ball ${n} nomi`}
                    className="h-9 flex-1 rounded-md border border-gray-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              );
            })}
        </div>

        <div className="mt-4 rounded-md border border-dashed border-gray-200 p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Ko'rinishi (baholash sahifasidagi tugmalar):
          </p>
          <ScoreButtons value={null} onChange={() => {}} labels={gradeLabels} />
        </div>
      </SettingsSection>

      {/* 3) Reyting */}
      <SettingsSection
        icon={Trophy}
        title="Reyting"
        description="Reyting qaysi davr bo'yicha hisoblanishi va nechta o'quvchi ko'rsatilishini belgilang."
      >
        <div className="divide-y divide-gray-100">
          <SettingRow
            label="Hisoblash davri"
            hint="Reyting ballari shu oraliq bo'yicha jamlanadi."
            control={
              <Select
                value={ratingPeriod}
                onChange={(v) => setField("ratingPeriod", v)}
                options={RATING_PERIODS}
                triggerClassName="w-44"
              />
            }
          />
          <SettingRow
            label="Top o'quvchilar soni"
            hint="Reyting ro'yxatida nechta eng yuqori o'quvchi ko'rsatilsin."
            control={
              <Select
                value={String(ratingTopN)}
                onChange={(v) => setField("ratingTopN", Number(v))}
                options={TOP_N_OPTIONS.map((o) => ({
                  value: String(o.value),
                  label: o.label,
                }))}
                triggerClassName="w-44"
              />
            }
          />
          <SettingRow
            label="Kechikishni hisobga olish"
            hint="Yoqilsa, davomat foizida kechikkan dars 'kelmagan' deb hisoblanadi."
            control={
              <Switch
                checked={countLateAsAbsent}
                onChange={(v) => setField("countLateAsAbsent", v)}
              />
            }
          />
        </div>
      </SettingsSection>

      {/* 4) Avtomatlashtirish */}
      <SettingsSection
        icon={Bot}
        title="Avtomatlashtirish"
        description="Eslatma va bildirishnomalarni avtomatlashtiring. Bildirishnomalar moduli orqali yuboriladi."
      >
        <div className="divide-y divide-gray-100">
          <SettingRow
            label="Baholanmaganlar uchun eslatma"
            hint="Dars kuni oxirida baholanmagan o'quvchilar bo'lsa, o'qituvchiga eslatma yuboriladi."
            control={
              <Switch
                checked={autoRemindUngraded}
                onChange={(v) => setField("autoRemindUngraded", v)}
              />
            }
          />
          <SettingRow
            label="Ota-onaga bildirishnoma"
            hint="Baho qo'yilganda natija ota-onaga bildirishnoma orqali yuboriladi."
            control={
              <Switch
                checked={notifyParents}
                onChange={(v) => setField("notifyParents", v)}
              />
            }
          />
          <SettingRow
            label="O'quvchiga bildirishnoma"
            hint="Baho qo'yilganda natija o'quvchining o'ziga yuboriladi."
            control={
              <Switch
                checked={notifyStudents}
                onChange={(v) => setField("notifyStudents", v)}
              />
            }
          />
        </div>
      </SettingsSection>
    </div>
  );
};

const SettingsSkeleton = () => (
  <div className="space-y-4">
    <Skeleton className="h-9 w-56" />
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="rounded-md border bg-white p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      </div>
    ))}
  </div>
);

export default RatingSettingsPage;
