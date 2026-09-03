import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import useObjectState from "@/shared/hooks/useObjectState";
import { extractApiErrorMessage } from "@/shared/utils/apiError";
import useBotAuthLoginMutation from "../hooks/useBotAuthLoginMutation";

// Components
import InputField from "@/shared/components/ui/input/InputField";
import Button from "@/shared/components/ui/button/Button";
import BrandMark from "@/shared/components/brand/BrandMark";

// Constants
import { APP_NAME } from "@/shared/constants/app";

/**
 * Mini ilova sahifasi.
 *
 * BALANDLIK: `min-h-screen` (100vh) Telegram'da NOTO'G'RI - mini ilova varag'i
 * ekrandan past turadi va klaviatura ochilganda o'lchami o'zgaradi. Natijada
 * kontent 100vh ning o'rtasiga markazlashib, tepada katta bo'sh joy qolardi.
 * Telegram `--tg-viewport-stable-height` o'zgaruvchisini o'zi yozadi
 * (telegram-web-app.js), brauzerda esa 100svh fallback ishlaydi.
 *
 * FON: ilgari `bg-gradient-to-b from-muted to-blue-50` edi. `blue-50` dark
 * rejimda ham oq bo'lib qolardi - ekranning pastki qismidagi oq yorug'lik
 * aynan shundan edi. Endi fon `bg-background` tokeni: ikkala rejimda to'g'ri.
 *
 * KARTA YO'Q: mini ilovaning o'zi allaqachon varaq (sheet). Uning ustiga
 * yana ramka + soya qo'yilsa ikki qavat karta hosil bo'ladi.
 */
const Container = ({ children }) => (
  <div
    className="flex items-start justify-center bg-background px-5 pt-10 pb-6"
    style={{ minHeight: "var(--tg-viewport-stable-height, 100svh)" }}
  >
    <div className="w-full max-w-md space-y-4 text-center">{children}</div>
  </div>
);

// "rgb(9, 9, 11)" -> "#09090b". Telegram faqat hex qabul qiladi.
const rgbToHex = (value) => {
  const nums = String(value).match(/\d+/g);
  if (!nums || nums.length < 3) return null;
  return `#${nums
    .slice(0, 3)
    .map((n) => Number(n).toString(16).padStart(2, "0"))
    .join("")}`;
};

/**
 * Telegram'ning tepa paneli va varaq fonini ilova foniga moslaydi.
 *
 * Busiz mini ilova chat temasidan ajralib turadi: tepada Telegram'ning
 * o'z rangi, pastda ilovaning foni - "sayt ichiga solingan sayt" hissi
 * aynan shundan.
 */
const syncTelegramTheme = (tg) => {
  const hex = rgbToHex(getComputedStyle(document.body).backgroundColor);
  if (!hex) return;
  // Eski Telegram versiyalari ixtiyoriy hex qabul qilmaydi (setHeaderColor
  // uchun 7.10 kerak) - qo'llab-quvvatlanmasa jimgina o'tkazib yuboramiz.
  try {
    tg.setBackgroundColor?.(hex);
  } catch {
    /* eski versiya */
  }
  try {
    tg.setHeaderColor?.(hex);
  } catch {
    /* eski versiya */
  }
};

const Spinner = () => (
  <div className="inline-block size-8 border-4 border-blue-200 dark:border-blue-500/30 border-t-blue-600 rounded-full animate-spin" />
);

const BotAuthPage = () => {
  const navigate = useNavigate();
  const { user, role, roleMeta } = useAuth();
  const triedRef = useRef(false);
  const initDataRef = useRef("");

  // needLogin: Telegram ichida login formasini ko'rsatamiz; qolganlari UI holati
  const ui = useObjectState({
    needLogin: false,
    errorMsg: "",
    login: "",
    password: "",
  });

  // roleMeta serverdan keladi (custom rolda landing sahifa shu yerda).
  const goHome = (r, meta) =>
      // "/" — bosh sahifani ish makoni hal qiladi (useLoginMutation
      // dagi izohga qarang: `defaultPath` eskirishi mumkin).
      navigate("/", { replace: true });

  const { mutate: loginAndLink, isPending: isLoggingIn } =
    useBotAuthLoginMutation({
      onSuccess: (data) => goHome(data.user?.role, data.roleMeta),
      onError: (err) => {
        // ── ⚠ 404 = BOT BU TIZIMDA YOQILMAGAN ──
        //
        // Bu sahifa LOGIN'DAN OLDIN turadi, ya'ni `GET /features` (sessiya
        // talab qiladi) undan o'qib bo'lmaydi. Bot holatini bilishning
        // yagona yo'li — serverning 404 javobi. "Login yoki parol
        // noto'g'ri" deb ko'rsatish mijozni parolini qayta-qayta
        // terishga majburlardi.
        if (err?.response?.status === 404) {
          ui.setField(
            "errorMsg",
            "Telegram orqali kirish bu tizimda yoqilmagan. Login va parol bilan kiring.",
          );
          return;
        }
        ui.setField(
          "errorMsg",
          extractApiErrorMessage(err, "Login yoki parol noto'g'ri."),
        );
      },
    });

  useEffect(() => {
    if (triedRef.current) return;
    triedRef.current = true;

    const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : null;
    const initData = tg?.initData || "";
    // initDataUnsafe.user faqat HMAC tekshiruvisiz ko'rsatish uchun (diagnostika).
    const unsafeUser = tg?.initDataUnsafe?.user || null;

    // Telegram Mini App ichida EMAS (oddiy brauzer): login bo'lsa panelga, aks holda xabar.
    if (!tg || !initData) {
      if (user) {
        goHome(role, roleMeta);
        return;
      }
      // Diagnostika: initData nega bo'sh ekanini aniqlash uchun. tg bor-yo'qligi,
      // initDataUnsafe'da user bor-yo'qligi - ko'p hollarda WebApp tugmasi `web_app`
      // emas `url` turida yoki URL HTTPS emas bo'lsa, tg bor lekin initData bo'sh keladi.
      console.warn("[bot-auth] initData bo'sh", {
        hasTelegram: !!window.Telegram,
        hasWebApp: !!tg,
        version: tg?.version,
        platform: tg?.platform,
        hasInitDataUnsafeUser: !!unsafeUser,
        initDataLen: (tg?.initData || "").length,
      });
      ui.setField(
        "errorMsg",
        !tg
          ? "Bu sahifa faqat Telegram Mini ilovasi orqali ochilishi kerak."
          : "Telegram ma'lumotlari topilmadi. Mini ilovani Telegram'dan qayta oching (tugmani qayta bosing).",
      );
      return;
    }

    // Telegram ichida: HAR SAFAR login+parol so'raymiz va shu Telegram ID ni
    // kiritilgan akkauntga bog'laymiz. Avtomatik kirish (verify) YO'Q - shunda bitta
    // Telegram istalgancha akkauntga bog'lana oladi (har login yangi bog'lanish qo'shadi).
    try {
      tg.ready();
      tg.expand();
      syncTelegramTheme(tg);
    } catch {
      /* noop */
    }

    initDataRef.current = initData;
    ui.setField("needLogin", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!ui.login || !ui.password) return;
    ui.setField("errorMsg", "");
    loginAndLink({
      login: ui.login.trim(),
      password: ui.password,
      initData: initDataRef.current,
    });
  };

  // Telegram ichida: doim login+parol so'raymiz (kiritilgan akkauntga TG bog'lanadi).
  // Bu tekshiruv `user` tekshiruvidan OLDIN - qoldiq token bo'lsa ham yangi akkaunt
  // bog'lash uchun login formasi ko'rinishi kerak.
  if (ui.needLogin) {
    return (
      <Container>
        <BrandMark className="mx-auto size-12" />
        <h1 className="text-lg font-semibold">
          {APP_NAME} tizimiga kirish
        </h1>
        <p className="text-sm text-muted-foreground">
          Hisobingizni Telegram'ga bog'lash uchun login va parolingizni kiriting.
        </p>
        <form onSubmit={handleLogin} className="space-y-3 text-left">
          <InputField
            required
            name="username"
            label="Login yoki telefon"
            value={ui.login}
            disabled={isLoggingIn}
            placeholder="Foydalanuvchi nomi yoki telefon"
            onChange={(e) => ui.setField("login", e.target.value)}
          />
          <InputField
            required
            type="password"
            name="password"
            label="Parol"
            value={ui.password}
            disabled={isLoggingIn}
            onChange={(e) => ui.setField("password", e.target.value)}
          />
          {ui.errorMsg && <p className="text-sm text-red-600 dark:text-red-300">{ui.errorMsg}</p>}
          <Button type="submit" disabled={isLoggingIn} className="w-full">
            {isLoggingIn ? "Kirilyapti..." : "Kirish va bog'lash"}
          </Button>
        </form>
      </Container>
    );
  }

  if (ui.errorMsg) {
    return (
      <Container>
        <div className="text-3xl">⚠️</div>
        <h1 className="text-lg font-semibold">Kirib bo'lmadi</h1>
        <p className="text-sm text-muted-foreground">{ui.errorMsg}</p>
        <a
          href="/login"
          className="inline-block mt-2 text-sm text-blue-600 dark:text-blue-300 hover:underline"
        >
          Telefon va parol bilan kirish →
        </a>
      </Container>
    );
  }

  // Oddiy brauzer + qoldiq token: useEffect goHome qiladi, shu orada kutamiz.
  if (user) {
    return (
      <Container>
        <p className="text-muted-foreground">Yo'naltirilmoqda...</p>
      </Container>
    );
  }

  // Boshlang'ich holat (initData o'qilmoqda)
  return (
    <Container>
      <Spinner />
      <h1 className="text-lg font-semibold">Yuklanmoqda...</h1>
      <p className="text-sm text-muted-foreground">Iltimos, kuting...</p>
    </Container>
  );
};

export default BotAuthPage;
