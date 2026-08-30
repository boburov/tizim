import { Lock } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * TARIFDA YO'Q BO'LIM — MIJOZGA KO'RSATILADIGAN EKRAN.
 *
 * ── ⚠ NEGA JIM YO'NALTIRISH EMAS ──
 * `CoinGuard` o'chirilgan bo'limda bosh sahifaga jim qaytaradi va bu
 * o'sha yerda TO'G'RI: uni EGANING O'ZI o'chirgan, ya'ni bo'lim u
 * uchun umuman mavjud emas.
 *
 * Bu yerdagi holat boshqa: bo'lim MAVJUD, lekin tarifga kirmagan.
 * Jim qaytarish mijozga "sayt buzuq" degan taassurot berardi va u
 * qo'llab-quvvatlashga yozardi. Ochiq aytilsa — bu sotuv imkoniyati.
 *
 * ⚠ NARX BU YERDA YOZILMAYDI. Narx tarifga bog'liq va o'zgaradi;
 * uni klientga qattiq yozib qo'yish eskirgan raqamni ko'rsatishning
 * eng oson yo'li.
 */
const FeatureUnavailable = ({ title = "Bu bo'lim tarifingizda yo'q" }) => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
    <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted">
      <Lock className="size-6 text-muted-foreground" />
    </div>

    <h1 className="text-lg font-semibold">{title}</h1>

    <p className="mt-2 max-w-md text-sm text-muted-foreground">
      Bu imkoniyat mavjud, lekin sizning joriy tarifingizga kirmagan.
      Ulash uchun markaz egasi yoki bizning jamoamiz bilan bog'laning.
    </p>

    <Link
      to="/"
      className="mt-6 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
    >
      Bosh sahifaga qaytish
    </Link>
  </div>
);

export default FeatureUnavailable;
