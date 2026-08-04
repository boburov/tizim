// React
import { useEffect } from "react";

// Icons
import { CalendarClock, Save } from "lucide-react";

// Components
import Card from "@/shared/components/ui/card/Card";
import Field from "@/shared/components/ui/field/Field";
import Input from "@/shared/components/ui/input/Input";
import Button from "@/shared/components/ui/button/Button";
import { Switch } from "@/shared/components/shadcn/switch";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import { useUpdateStorageSettingsMutation } from "../hooks/useStorageAdmin";

// Utils
import { cn } from "@/shared/utils/cn";
import { formatDateUz } from "@/shared/utils/formatDate";

// Chastota - server enum'i bilan bir xil kalitlar.
const FREQUENCIES = [
  { value: "weekly", label: "Har hafta" },
  { value: "monthly", label: "Har oy" },
  { value: "semiannual", label: "Olti oyda bir" },
];

// Tez tanlash uchun tayyor muddatlar. Qo'lda ham kiritish mumkin -
// bular faqat eng ko'p ishlatiladigan qiymatlar.
const PRESET_DAYS = [30, 90, 180, 365];

/**
 * AVTO-TOZALASH SIYOSATI.
 *
 * Ikki mustaqil sozlama:
 *   - CHASTOTA    - tozalash qanchalik tez-tez yuradi;
 *   - MUDDAT      - qaysi fayllar "eskirgan" hisoblanadi.
 *
 * Ular ATAYLAB ajratilgan: "har hafta yur, lekin 6 oydan eski fayllarni
 * o'chir" - mutlaqo qonuniy sozlama va u disk bosimini tekis ushlaydi.
 * Bitta "har hafta tozala" degan tanlov esa o'tgan haftagi vazifani ham
 * o'chirib yuborardi.
 */
const CleanupPolicyCard = ({ settings }) => {
  const { enabled, frequency, olderThanDays, setField, setFields } =
    useObjectState({
      enabled: false,
      frequency: "monthly",
      olderThanDays: 180,
    });

  // Server javobi kelgach formani to'ldiramiz.
  useEffect(() => {
    if (!settings) return;
    setFields({
      enabled: !!settings.autoCleanupEnabled,
      frequency: settings.frequency || "monthly",
      olderThanDays: settings.olderThanDays ?? 180,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.updatedAt]);

  const { mutate: save, isPending } = useUpdateStorageSettingsMutation();

  const onSave = () => {
    const days = Number(olderThanDays);
    save({
      autoCleanupEnabled: enabled,
      frequency,
      olderThanDays: Number.isInteger(days) && days > 0 ? days : 180,
    });
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Avto-tozalash</h2>
          <p className="text-sm text-muted-foreground">
            Eskirgan fayllar belgilangan jadval bo'yicha o'chiriladi
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => setField("enabled", v)}
          disabled={isPending}
        />
      </div>

      {/* O'chiq bo'lsa sozlamalar ko'rsatiladi, lekin faolsiz - foydalanuvchi
          nima yoqilishini oldindan ko'rib turadi. */}
      <div
        className={cn(
          "space-y-4 transition-opacity",
          !enabled && "pointer-events-none opacity-50",
        )}
      >
        <Field label="Qanchalik tez-tez">
          <div className="flex flex-wrap gap-2">
            {FREQUENCIES.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setField("frequency", f.value)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  frequency === f.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Necha kundan eski fayllar o'chsin">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {PRESET_DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setField("olderThanDays", d)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    Number(olderThanDays) === d
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "bg-card hover:bg-muted",
                  )}
                >
                  {d} kun
                </button>
              ))}
            </div>
            <Input
              type="number"
              min={1}
              max={3650}
              value={olderThanDays}
              onChange={(e) => setField("olderThanDays", e.target.value)}
              className="max-w-40"
            />
          </div>
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <div className="text-xs text-muted-foreground">
          {settings?.lastRunAt ? (
            <span>
              Oxirgi yurish: {formatDateUz(settings.lastRunAt)} -{" "}
              {settings.lastRunDeleted} ta fayl
            </span>
          ) : (
            <span>Hali avtomatik tozalanmagan</span>
          )}
          {settings?.nextRunAt && enabled && (
            <span className="ml-2 inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" />
              Keyingisi: {formatDateUz(settings.nextRunAt)}
            </span>
          )}
        </div>

        <Button onClick={onSave} disabled={isPending}>
          <Save className="size-4" />
          {isPending ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </Card>
  );
};

export default CleanupPolicyCard;
