/**
 * MA'LUMOT HOLATI - butun dashboard qatlamining yagona shartnomasi.
 *
 * ═══════════════════════════════════════════════════════════════════
 * MUAMMO: dashboard komponenti raqamni O'YLAB TOPISHI juda oson.
 *
 *   const total = data?.total || 0;     // <- server javob bermadi -> "0"
 *   <KpiTile value={total} />           // <- ekranda ishonchli "0 so'm"
 *
 * Owner ekranda "0 so'm tushum" ni ko'radi va bu HAQIQAT deb o'qiydi.
 * Aslida so'rov yiqilgan yoki endpoint hali ulanmagan. `|| 0` bitta
 * belgidan iborat, lekin u yolg'on moliyaviy ma'lumot chiqaradi.
 *
 * YECHIM: qiymat va HOLAT birga yuriladi. Komponent qiymatni faqat
 * `status === "ready"` bo'lgandagina ko'rsatadi - qolgan hamma holatda
 * u raqam o'rniga holatni ko'rsatadi. Ya'ni yolg'on raqam chiqarish
 * uchun `|| 0` yozish YETARLI EMAS, `status` ni ham qo'lda "ready"
 * qilib qo'yish kerak - bu esa ko'zga tashlanadi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * `unknown` DARAJASI BILAN BOG'LIQ: `ai/utils/dashboard.utils.js` dagi
 * LEVEL_STYLES.unknown ataylab RANGSIZ - "o'lchanmagan" holat "yaxshi"
 * (yashil) bo'lib ko'rinmasligi kerak. Shu yerdagi mantiq ham xuddi
 * o'sha qoidaning davomi: o'lchanmagan narsa raqam bo'lib ko'rinmaydi.
 */

export const DATA_STATUS = Object.freeze({
  /** Hali so'ralmagan (masalan filial tanlanmagan, davr tanlanmagan). */
  IDLE: "idle",
  /** So'rov ketdi, javob kutilmoqda. */
  LOADING: "loading",
  /** So'rov yiqildi. Qiymat KO'RSATILMAYDI. */
  ERROR: "error",
  /** So'rov muvaffaqiyatli, lekin natija bo'sh (haqiqiy "hech narsa yo'q"). */
  EMPTY: "empty",
  /**
   * Manba hali ulanmagan. `EMPTY` dan FARQ QILADI va bu farq muhim:
   * "bu oy to'lov bo'lmagan" (EMPTY) va "to'lovlar hali ko'chirilmagan"
   * (NOT_CONNECTED) - owner uchun butunlay boshqa xabar. Birinchisi
   * biznes fakti, ikkinchisi texnik holat.
   */
  NOT_CONNECTED: "not_connected",
  /** Ma'lumot bor va ishonchli. FAQAT shu holatda raqam ko'rsatiladi. */
  READY: "ready",
});

export const ALL_DATA_STATUSES = Object.values(DATA_STATUS);

/** Faqat shu holatda haqiqiy qiymat ko'rsatiladi. */
export const isReady = (status) => status === DATA_STATUS.READY;

/** Skelet ko'rsatiladigan holatlar. */
export const isPending = (status) =>
  status === DATA_STATUS.LOADING || status === DATA_STATUS.IDLE;

/**
 * Bo'sh natijani aniqlash. `0` va `false` BO'SH EMAS - ular haqiqiy
 * o'lchov natijasi. Faqat `null`/`undefined`, bo'sh massiv va bo'sh
 * obyekt bo'sh hisoblanadi.
 *
 * Bu farq muhim: `emptyCheck` `!value` bo'lganida "0 ta qarzdor"
 * degan HAQIQIY va yaxshi natija "ma'lumot yo'q" bo'lib ko'rinardi.
 */
export const isEmptyResult = (value) => {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (value instanceof Date) return false;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
};

/**
 * Endpoint HALI YO'Q ekanini bildiruvchi HTTP kodlari.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA JAVOBDAN ANIQLANADI, ro'yxatdan emas
 *
 * Boshida "qaysi manba ulangan" degan ro'yxatni klientda saqlash
 * o'ylangan edi. U ikki tomonlama noto'g'ri bo'lardi:
 *
 *   • Backend modul ko'chib, endpoint TIRILGANDA klient hamon
 *     "ulanmagan" deb turaveradi - kimdir ro'yxatni yangilashni
 *     eslamaguncha. Ishlab turgan ma'lumot yashirin qoladi.
 *   • Aksincha, ro'yxatda "ulangan" deb yozilgan endpoint hali
 *     yo'q bo'lsa - foydalanuvchi tarmoq xatosini ko'radi va uni
 *     o'z internetidan deb o'ylaydi.
 *
 * 404 - marshrut umuman mount qilinmagan (ko'chirilmagan modul).
 * 501 - server ochiq aytadi: "amalga oshirilmagan".
 *
 * DIQQAT: bu FAQAT dashboard AGREGAT endpointlari uchun to'g'ri.
 * `/students/:id` kabi yakka yozuv so'rovida 404 "bunday o'quvchi
 * yo'q" degani - shuning uchun `notConnectedOn: []` bilan o'chiriladi.
 * ═══════════════════════════════════════════════════════════════════
 */
export const MISSING_ENDPOINT_CODES = Object.freeze([404, 501]);

/**
 * TanStack Query natijasini holat + qiymatga aylantiradi.
 *
 * Bu YAGONA ko'prik: dashboard komponentlari TanStack haqida hech
 * narsa bilmaydi, ya'ni ertaga ma'lumot boshqa manbadan (WebSocket,
 * SSR, statik prop) kelsa komponentga TEGILMAYDI - shunchaki boshqa
 * adapter yoziladi.
 *
 * @param {object} query   TanStack `useQuery` natijasi
 * @param {object} [opts]
 * @param {boolean} [opts.connected=true]  majburiy "ulanmagan" belgisi
 * @param {number[]} [opts.notConnectedOn] "endpoint yo'q" deb hisoblanadigan kodlar
 * @param {Function} [opts.select]         `query.data` dan kerakli bo'lakni olish
 * @param {Function} [opts.emptyWhen]      maxsus "bo'sh" sharti
 * @returns {{status: string, data: any, error: any, refetch: Function}}
 */
export const fromQuery = (query, opts = {}) => {
  const {
    connected = true,
    notConnectedOn = MISSING_ENDPOINT_CODES,
    select,
    emptyWhen,
  } = opts;

  if (!connected) {
    return {
      status: DATA_STATUS.NOT_CONNECTED,
      data: null,
      error: null,
      refetch: query?.refetch,
    };
  }

  if (!query) {
    return { status: DATA_STATUS.IDLE, data: null, error: null, refetch: undefined };
  }

  const { isLoading, isFetching, isError, error, data, refetch, fetchStatus } = query;

  // `fetchStatus === "idle"` + ma'lumot yo'q = so'rov `enabled: false`
  // bilan to'xtatilgan. Bu YUKLANISH EMAS: skelet abadiy aylanib
  // turardi va foydalanuvchi "osilib qoldi" deb o'ylardi.
  if (fetchStatus === "idle" && data === undefined && !isError) {
    return { status: DATA_STATUS.IDLE, data: null, error: null, refetch };
  }

  if (isError) {
    const code = error?.response?.status;
    const missing = notConnectedOn?.includes?.(code);
    return {
      status: missing ? DATA_STATUS.NOT_CONNECTED : DATA_STATUS.ERROR,
      data: null,
      error,
      refetch,
    };
  }

  if (isLoading || (isFetching && data === undefined)) {
    return { status: DATA_STATUS.LOADING, data: null, error: null, refetch };
  }

  const picked = typeof select === "function" ? select(data) : data;
  const empty =
    typeof emptyWhen === "function" ? emptyWhen(picked) : isEmptyResult(picked);

  if (empty) {
    return { status: DATA_STATUS.EMPTY, data: picked ?? null, error: null, refetch };
  }

  return { status: DATA_STATUS.READY, data: picked, error: null, refetch };
};

/**
 * Bir nechta manbani BITTA holatga yig'adi (bo'lim bir necha so'rovga
 * tayansa kerak bo'ladi).
 *
 * Tartib ATAYLAB shunday: xato > ulanmagan > yuklanmoqda > idle > bo'sh.
 * Xato eng ustun, chunki bitta so'rov yiqilgan bo'lsa bo'lim TO'LIQ
 * emas - qolgan raqamlarni ko'rsatish yarim haqiqat bo'lardi va u
 * yolg'ondan xavfliroq (owner uni to'liq deb o'qiydi).
 */
export const combineStatus = (...statuses) => {
  const list = statuses.flat().filter(Boolean);
  if (!list.length) return DATA_STATUS.IDLE;
  if (list.includes(DATA_STATUS.ERROR)) return DATA_STATUS.ERROR;
  if (list.includes(DATA_STATUS.NOT_CONNECTED)) return DATA_STATUS.NOT_CONNECTED;
  if (list.includes(DATA_STATUS.LOADING)) return DATA_STATUS.LOADING;
  if (list.includes(DATA_STATUS.IDLE)) return DATA_STATUS.IDLE;
  if (list.every((s) => s === DATA_STATUS.EMPTY)) return DATA_STATUS.EMPTY;
  return DATA_STATUS.READY;
};

/**
 * Bitta manbaning QISMINI alohida holat sifatida oladi.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA KERAK: bitta so'rov bir nechta ko'rsatkichni qaytaradi va
 * ularning ba'zilari BO'LMASLIGI mumkin, so'rovning o'zi esa
 * muvaffaqiyatli.
 *
 * Masalan `/admin-dashboard/overview` javobida `attendanceGauge` bor,
 * lekin bugun dars belgilanmagan bo'lsa uning `rate` maydoni `null`.
 * So'rov holati `ready`, ya'ni qism-komponentga to'g'ridan-to'g'ri
 * `data.attendanceGauge` uzatilsa u "ma'lumot bor" deb o'ylab, nolinchi
 * diagramma chizardi.
 *
 *   const gauge = narrow(overview, (d) => d.attendanceGauge,
 *                        { emptyWhen: (g) => g?.rate == null });
 *
 * Endi `gauge.status` = `empty` va qobiq "Bugun dars belgilanmagan"
 * deb yozadi. Xato/yuklanish holatlari esa ASOSIY manbadan meros
 * bo'lib qoladi - ular qismga ham tegishli.
 * ═══════════════════════════════════════════════════════════════════
 */
export const narrow = (source, selector, { emptyWhen } = {}) => {
  if (!source) return { status: DATA_STATUS.IDLE, data: null, error: null };

  // `ready` bo'lmagan holat butunicha meros: so'rov yiqilgan bo'lsa
  // qism ham yiqilgan, yuklanayotgan bo'lsa qism ham yuklanmoqda.
  if (source.status !== DATA_STATUS.READY) return source;

  const picked =
    typeof selector === "function" ? selector(source.data) : source.data;

  const empty =
    typeof emptyWhen === "function" ? emptyWhen(picked) : isEmptyResult(picked);

  return {
    ...source,
    status: empty ? DATA_STATUS.EMPTY : DATA_STATUS.READY,
    data: picked ?? null,
  };
};

/**
 * Statik (so'rovsiz) manba uchun. Prop orqali kelgan ma'lumotni
 * shartnomaga kiritadi - komponentlar ikki xil yo'l bilan
 * ishlatilmasligi uchun.
 */
export const fromValue = (value, { connected = true } = {}) => {
  if (!connected) return { status: DATA_STATUS.NOT_CONNECTED, data: null, error: null };
  if (value === undefined) return { status: DATA_STATUS.IDLE, data: null, error: null };
  if (isEmptyResult(value)) return { status: DATA_STATUS.EMPTY, data: value ?? null, error: null };
  return { status: DATA_STATUS.READY, data: value, error: null };
};
