// Icons
import { Coins } from "lucide-react";

// Utils
import { cn } from "@/shared/utils/cn";

// Hooks
import useCoinConfig from "@/shared/hooks/useCoinConfig";

/**
 * TANGA MIQDORI — bitta ko'rinish, hamma ekranda.
 *
 * ── NEGA ALOHIDA KOMPONENT ──
 * Miqdor sakkiz joyda chiqadi (hamyon, katalog, buyurtma, tarix,
 * reyting, sozlama...). Har joyda qo'lda yozilsa nom ("tanga" /
 * "ball") va ishora (+/−) muqarrar ravishda ajralib ketardi — ega
 * nomni o'zgartirsa esa faqat ba'zi ekranlarda yangilanardi.
 *
 * ── NOM SOZLAMADAN ──
 * `coinLabel` ni ega o'zgartira oladi. Shuning uchun u qat'iy
 * yozilmaydi, `useCoinConfig()` dan olinadi.
 *
 * ── PUL EMAS ──
 * Bu yerda `formatMoney` ATAYLAB ISHLATILMAYDI: tanga so'm emas va
 * uni pul kabi ko'rsatish ("12 000 so'm" shaklida) o'quvchiga uni
 * naqdga almashtirish mumkindek tuyulardi. Oddiy butun son + nom.
 */
const CoinAmount = ({
  value,
  size = "md",
  signed = false,
  showLabel = true,
  className,
}) => {
  const { coinLabel } = useCoinConfig();
  const amount = Number(value) || 0;

  // Ishora FAQAT `signed` bo'lsa: hamyon balansida "+120" g'alati
  // ko'rinardi, tarixda esa ishorasiz qator o'qib bo'lmasdi.
  const sign = signed && amount > 0 ? "+" : "";

  const tone = !signed
    ? "text-foreground"
    : amount > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-semibold tabular-nums",
        size === "lg" && "text-2xl",
        size === "md" && "text-sm",
        size === "sm" && "text-xs",
        tone,
        className,
      )}
    >
      <Coins
        className={cn(
          "shrink-0 text-amber-500",
          size === "lg" ? "size-6" : size === "sm" ? "size-3" : "size-4",
        )}
        strokeWidth={2}
      />
      {sign}
      {amount.toLocaleString("uz-UZ")}
      {showLabel && (
        <span className="font-normal text-muted-foreground">{coinLabel}</span>
      )}
    </span>
  );
};

export default CoinAmount;
