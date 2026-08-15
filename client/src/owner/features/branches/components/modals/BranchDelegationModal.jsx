// React
import { useState } from "react";

// Components
import Select from "@/shared/components/ui/select/Select";
import Button from "@/shared/components/ui/button/Button";
import Input from "@/shared/components/ui/input/Input";
import InputMoney from "@/shared/components/ui/input/InputMoney";

// Hooks
import useDelegationOptionsQuery from "../../hooks/useDelegationOptionsQuery";
import { useBranchUpdateMutation } from "../../hooks/useBranchMutations";

// Rejim nomlari. Server faqat kalitni biladi, matn UI'niki.
const MODE_LABELS = {
  auto: "O'zi hal qiladi",
  threshold: "Chegara ichida o'zi",
  approval: "Doim tasdiqdan o'tadi",
  forbidden: "Taqiqlangan",
};

const MODE_HINTS = {
  auto: "Standart holat: filial rahbari o'zi bajaradi.",
  threshold: "Chegara ichida o'zi bajaradi, oshsa sizga so'rov keladi.",
  approval: "Har safar sizning tasdig'ingizga tushadi.",
  forbidden: "Filial rahbari bu amalni umuman bajara olmaydi.",
};

const LIMIT_LABELS = {
  maxAmount: "Eng ko'pi (so'm)",
  minAmount: "Eng kami (so'm)",
  maxPercent: "Eng ko'pi (%)",
};

// STANDART = "auto". Server bilan AYNI qiymat bo'lishi shart
// (constants/delegation.js DEFAULT_DELEGATION_MODE).
//
// Bu matritsa "ruxsat berish ro'yxati" EMAS, "cheklov ro'yxati": qoida
// yozilmagan tur avtomatik ravishda rahbarga tegishli. Shuning uchun
// saqlashda faqat "auto"dan FARQ QILADIGAN qatorlar yuboriladi.
const DEFAULT_MODE = "auto";

/**
 * Bitta tur uchun qator: rejim + (kerak bo'lsa) chegaralar.
 */
const KindRow = ({ spec, rule, onChange, disabled }) => {
  const mode = rule?.mode || DEFAULT_MODE;
  const showLimits = mode === "threshold" && spec.limits.length > 0;

  const setMode = (next) => {
    // Rejim almashganda chegaralar TASHLANADI: "threshold"dan "auto"ga
    // o'tib qaytilsa eski raqam qolib ketardi va owner uni ko'rmay
    // tasdiqlab yuborardi.
    onChange({ mode: next });
  };

  const setLimit = (field, value) => {
    onChange({ ...rule, mode, [field]: value });
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">{spec.label}</p>
          <p className="text-xs text-muted-foreground">{MODE_HINTS[mode]}</p>
        </div>
        <Select
          value={mode}
          disabled={disabled}
          onChange={setMode}
          triggerClassName="sm:max-w-[210px]"
          options={spec.modes.map((m) => ({ value: m, label: MODE_LABELS[m] || m }))}
        />
      </div>

      {showLimits && (
        <div className="grid gap-2 sm:grid-cols-2">
          {spec.limits.map((field) => (
            <label key={field} className="space-y-1">
              <span className="text-xs text-muted-foreground">
                {LIMIT_LABELS[field] || field}
              </span>
              {field === "maxPercent" ? (
                <Input
                  type="number"
                  min="0"
                  max="100"
                  disabled={disabled}
                  value={rule?.[field] ?? ""}
                  onChange={(e) => setLimit(field, e.target.value)}
                />
              ) : (
                <InputMoney
                  disabled={disabled}
                  value={rule?.[field] ?? ""}
                  onChange={(e) => setLimit(field, e.target.value)}
                />
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * FILIAL ISHONCH DARAJASI.
 *
 * Ilgari tanlov IKKILIK edi: filial rahbariga "approvals.decide_config"
 * ruxsatini berish (u holda u O'Z so'rovini o'zi tasdiqlardi) yoki
 * bermaslik (u holda har bir xodim, har bir narx owner orqali o'tardi).
 * Bu forma o'rtadagi yo'lni beradi va uni HAR FILIALGA alohida qo'yadi.
 *
 * DIQQAT: maosh turlarida "O'zi hal qiladi" varianti YO'Q - ro'yxat
 * serverdan keladi va u yerda ataylab kesilgan (constants/delegation.js).
 * Shuning uchun `spec.modes` dan tashqariga chiqilmaydi.
 */
const BranchDelegationModal = ({ branch = {}, close, isLoading, setIsLoading }) => {
  const { data, isLoading: optionsLoading } = useDelegationOptionsQuery();
  const kinds = data?.kinds || [];

  // Kalitlar soni oldindan noma'lum (serverdan keladi), shuning uchun
  // yagona obyekt holati - useObjectState emas, chunki u aniq kalitlar
  // ustida ishlaydi.
  const [matrix, setMatrix] = useState(() => ({ ...(branch.delegation || {}) }));

  const { mutate } = useBranchUpdateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsLoading(true);

    // FAQAT CHEKLOVLAR yuboriladi.
    //
    // "auto" - standart holat, ya'ni kalitning YO'QLIGI bilan bir xil
    // ma'no. Uni ham yuborsak, matritsa vaqt o'tib faqat standart
    // qiymatlar bilan to'lib ketardi va "bu filialda nima CHEKLANGAN"
    // degan savolga javob berish qiyinlashardi.
    const payload = {};
    for (const spec of kinds) {
      const rule = matrix[spec.kind];
      const mode = rule?.mode || DEFAULT_MODE;
      if (mode === DEFAULT_MODE) continue;

      const next = { mode };
      if (mode === "threshold") {
        for (const field of spec.limits) {
          const raw = String(rule?.[field] ?? "").trim();
          // Bo'sh chegara YUBORILMAYDI - server uni "kiritilmagan" deb
          // o'qiydi va fail-closed ishlaydi (tasdiqqa yuboradi).
          if (raw !== "") next[field] = Number(raw);
        }
      }
      payload[spec.kind] = next;
    }

    mutate({ id: branch._id, body: { delegation: payload } });
  };

  const busy = isLoading || optionsLoading;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{branch.name}</span> filiali
        rahbari standart holatda hamma sozlamani o'zi hal qiladi. Quyida faqat{" "}
        <span className="font-medium text-foreground">cheklamoqchi</span> bo'lgan
        amallaringizni o'zgartiring.
      </p>

      {optionsLoading ? (
        <p className="py-6 text-center text-sm opacity-60">Yuklanmoqda...</p>
      ) : (
        <div className="space-y-2">
          {kinds.map((spec) => (
            <KindRow
              key={spec.kind}
              spec={spec}
              disabled={busy}
              rule={matrix[spec.kind]}
              onChange={(next) =>
                setMatrix((prev) => ({ ...prev, [spec.kind]: next }))
              }
            />
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={() => close?.()}
          disabled={busy}
          className="flex-1"
        >
          Bekor qilish
        </Button>
        <Button type="submit" disabled={busy} className="flex-1">
          {isLoading ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </form>
  );
};

export default BranchDelegationModal;
