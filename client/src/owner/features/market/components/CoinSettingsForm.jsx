// React
import { useEffect } from "react";

// Icons
import { Power, ShoppingBag, AlertTriangle } from "lucide-react";

// Components
import Card from "@/shared/components/ui/card/Card";
import Button from "@/shared/components/ui/button/Button";
import Switch from "@/shared/components/ui/switch/Switch";
import InputField from "@/shared/components/ui/input/InputField";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";

// Mutations
import { useCoinSettingsMutation } from "../hooks/useMarketMutations";

const EMPTY = {
  isEnabled: true,
  marketEnabled: true,
  orderAutoApprove: false,
  coinLabel: "tanga",
  attendancePresentCoins: 1,
  attendanceExcusedCoins: 0,
  gradeMinValue: 3,
  gradeCoinsPerPoint: 1,
  dailyEarnLimit: 0,
};

/**
 * ══════════════════════════════════════════════════════════════════════
 * TANGA SOZLAMALARI — BU YERDA O'CHIRGICH BOR
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── O'CHIRGICH DARHOL ISHLAYDI, "SAQLASH" NI KUTMAYDI ──
 * Ikkita kalit (`isEnabled`, `marketEnabled`) bosilishi bilan
 * yuboriladi. Sabab: ular XAVFSIZLIK tugmasi. "Tezda o'chiraman" degan
 * odam kalitni bosib, sahifadan chiqib ketishi mumkin — o'zgarish
 * "Saqlash" ortida tursa, u o'chirdim deb o'ylab qolardi, aslida
 * bo'lim ishlashda davom etardi.
 *
 * Qolgan maydonlar (stavkalar) esa odatdagidek — ular birgalikda
 * ma'noga ega va yarim tahrirlangan holatda saqlanmasligi kerak.
 *
 * ── NEGA FORMA SERVERDAN QAYTA YUKLANADI ──
 * `useEffect` sozlama kelganda maydonlarni to'ldiradi. Bog'liqlik —
 * `settings?._id` (`AttendanceSettingsPage` bilan bir xil naqsh):
 * obyektning O'ZI bog'liqlik bo'lsa, har so'rovda yangi havola kelib
 * effekt cheksiz ishlab, foydalanuvchining yozganini bosib ketardi.
 */
const CoinSettingsForm = ({ settings, isLoading }) => {
  const { state, setField, setFields } = useObjectState(EMPTY);

  useEffect(() => {
    if (!settings) return;
    setFields({
      isEnabled: settings.isEnabled ?? true,
      marketEnabled: settings.marketEnabled ?? true,
      orderAutoApprove: settings.orderAutoApprove ?? false,
      coinLabel: settings.coinLabel ?? "tanga",
      attendancePresentCoins: settings.attendancePresentCoins ?? 1,
      attendanceExcusedCoins: settings.attendanceExcusedCoins ?? 0,
      gradeMinValue: settings.gradeMinValue ?? 3,
      gradeCoinsPerPoint: settings.gradeCoinsPerPoint ?? 1,
      dailyEarnLimit: settings.dailyEarnLimit ?? 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?._id, settings?.updatedAt]);

  const { mutate, isPending } = useCoinSettingsMutation();

  /** Kalitlar — DARHOL (yuqoridagi izohga qarang). */
  const toggle = (key, value) => {
    setField(key, value);
    mutate({ [key]: value });
  };

  const submitRates = (e) => {
    e.preventDefault();
    mutate({
      orderAutoApprove: state.orderAutoApprove,
      coinLabel: String(state.coinLabel || "tanga").trim(),
      attendancePresentCoins: Number(state.attendancePresentCoins) || 0,
      attendanceExcusedCoins: Number(state.attendanceExcusedCoins) || 0,
      gradeMinValue: Number(state.gradeMinValue) || 1,
      gradeCoinsPerPoint: Number(state.gradeCoinsPerPoint) || 0,
      dailyEarnLimit: Number(state.dailyEarnLimit) || 0,
    });
  };

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-md border bg-muted/40" />;
  }

  return (
    <div className="space-y-4">
      {/* ══ O'CHIRGICHLAR ══ */}
      <Card className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <Power className="size-4 text-primary" />
              Tanga tizimi
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              O'chirilsa bo'lim <b>hamma uchun</b> yo'qoladi: menyu yozuvi
              ko'rinmaydi, sahifalar ochilmaydi va davomat uchun tanga
              hisoblanmaydi. To'plangan tangalar saqlanib qoladi.
            </p>
          </div>
          <Switch
            checked={state.isEnabled}
            onChange={(v) => toggle("isEnabled", v)}
            disabled={isPending}
            aria-label="Tanga tizimi"
          />
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <ShoppingBag className="size-4 text-primary" />
                Market (do'kon)
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Faqat do'konni yopadi. Tanga to'planishda davom etadi —
                mahsulot ro'yxatini yangilayotganda qulay.
              </p>
            </div>
            <Switch
              checked={state.marketEnabled}
              onChange={(v) => toggle("marketEnabled", v)}
              disabled={isPending || !state.isEnabled}
              aria-label="Market"
            />
          </div>
        </div>

        {!state.isEnabled && (
          <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Bo'lim hozir o'chirilgan. Uni faqat shu sahifadan qayta yoqish
            mumkin — boshqa hamma manzil 404 qaytaradi.
          </p>
        )}
      </Card>

      {/* ══ TOPISH STAVKALARI ══ */}
      <Card>
        <form onSubmit={submitRates} className="space-y-4">
          <div>
            <p className="font-medium text-foreground">Qanday topiladi</p>
            <p className="mt-1 text-sm text-muted-foreground">
              O'quvchi darsga kelgani va olgan bahosi uchun tanga oladi.
              Stavka <b>0</b> bo'lsa o'sha manbadan tanga berilmaydi.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <InputField
              type="number"
              name="attendancePresentCoins"
              label="Darsga kelgani uchun"
              min={0}
              max={1000}
              value={state.attendancePresentCoins}
              onChange={(e) => setField("attendancePresentCoins", e.target.value)}
              disabled={isPending}
            />
            <InputField
              type="number"
              name="attendanceExcusedCoins"
              label="Sababli qoldirgani uchun"
              description="Odatda kamroq yoki 0"
              min={0}
              max={1000}
              value={state.attendanceExcusedCoins}
              onChange={(e) => setField("attendanceExcusedCoins", e.target.value)}
              disabled={isPending}
            />
            <InputField
              type="number"
              name="gradeMinValue"
              label="Eng past baho"
              description="Shundan past baho tanga bermaydi (1–5)"
              min={1}
              max={5}
              value={state.gradeMinValue}
              onChange={(e) => setField("gradeMinValue", e.target.value)}
              disabled={isPending}
            />
            <InputField
              type="number"
              name="gradeCoinsPerPoint"
              label="Har bir ball uchun"
              description={`5 baho × ${state.gradeCoinsPerPoint || 0} = ${
                5 * (Number(state.gradeCoinsPerPoint) || 0)
              } ${state.coinLabel || "tanga"}`}
              min={0}
              max={1000}
              value={state.gradeCoinsPerPoint}
              onChange={(e) => setField("gradeCoinsPerPoint", e.target.value)}
              disabled={isPending}
            />
            <InputField
              type="number"
              name="dailyEarnLimit"
              label="Kunlik chegara"
              description="0 = cheksiz. Bir kunda bitta o'quvchi topa oladigan eng ko'p miqdor."
              min={0}
              value={state.dailyEarnLimit}
              onChange={(e) => setField("dailyEarnLimit", e.target.value)}
              disabled={isPending}
            />
            <InputField
              name="coinLabel"
              label="Nomi"
              description="Interfeysda shu so'z ko'rinadi"
              maxLength={24}
              value={state.coinLabel}
              onChange={(e) => setField("coinLabel", e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
            <div className="min-w-0">
              <p className="font-medium text-foreground">Xaridni avtomatik tasdiqlash</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Yoqilsa buyurtma darhol «Tasdiqlandi» holatiga o'tadi —
                qo'lda ko'rib chiqish talab qilinmaydi.
              </p>
            </div>
            <Switch
              checked={state.orderAutoApprove}
              onChange={(v) => setField("orderAutoApprove", v)}
              disabled={isPending}
              aria-label="Avtomatik tasdiqlash"
            />
          </div>

          <Button type="submit" disabled={isPending}>
            {isPending ? "Saqlanmoqda..." : "Saqlash"}
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default CoinSettingsForm;
