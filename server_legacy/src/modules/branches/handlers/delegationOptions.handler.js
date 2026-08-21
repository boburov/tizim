import asyncHandler from "../../../middleware/asyncHandler.js";
import {
  DELEGATABLE_KINDS,
  ALL_DELEGATION_MODES,
  DEFAULT_DELEGATION_MODE,
} from "../../../constants/delegation.js";

// DELEGATSIYA KATALOGI - matritsa formasi shu ro'yxatdan quriladi.
//
// NEGA SERVERDAN: qaysi turga qaysi rejim mumkinligi XAVFSIZLIK qoidasi
// (maosh turlarida `auto` yo'q). Agar client o'z ro'yxatini tutsa, ikkalasi
// vaqt o'tib ajralib ketardi va forma taqiqlangan variantni ko'rsatib,
// server esa uni 400 bilan rad etardi - foydalanuvchi uchun tushunarsiz.
//
// Faqat statik metama'lumot qaytaradi, hech qanday filial ma'lumoti yo'q.
const delegationOptions = asyncHandler(async (_req, res) => {
  const kinds = Object.entries(DELEGATABLE_KINDS).map(([kind, spec]) => ({
    kind,
    label: spec.label,
    modes: spec.modes,
    limits: spec.limits,
    direction: spec.direction,
  }));

  res.json({
    success: true,
    data: { kinds, allModes: ALL_DELEGATION_MODES, defaultMode: DEFAULT_DELEGATION_MODE },
  });
});

export default delegationOptions;
