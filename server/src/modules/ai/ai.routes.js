import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import { requireFeature } from "../../middleware/enforceLimit.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { AI_FEATURE_KEY } from "./services/aiBudget.service.js";

import {
  listSchema,
  actionCenterSchema,
  bySubjectsSchema,
  byDomainSchema,
  briefingSchema,
  listReportsSchema,
  latestReportSchema,
  reportIdSchema,
  getConfigSchema,
  idParamSchema,
  dismissSchema,
  updateConfigSchema,
  recomputeSchema,
} from "./validators/insight.validator.js";

import list from "./handlers/list.handler.js";
import actionCenter from "./handlers/actionCenter.handler.js";
import bySubjects from "./handlers/bySubjects.handler.js";
import byDomain from "./handlers/byDomain.handler.js";
import briefing from "./handlers/briefing.handler.js";
import rankings from "./handlers/rankings.handler.js";
import listReports from "./handlers/listReports.handler.js";
import getReport from "./handlers/getReport.handler.js";
import latestReport from "./handlers/latestReport.handler.js";
import acknowledge from "./handlers/acknowledge.handler.js";
import resolve from "./handlers/resolve.handler.js";
import dismiss from "./handlers/dismiss.handler.js";
import getConfig from "./handlers/getConfig.handler.js";
import updateConfig from "./handlers/updateConfig.handler.js";
import recompute from "./handlers/recompute.handler.js";

const router = Router();

// --- TARIF DARVOZASI ---
//
// AI qatlami pullik. Tekshiruv router darajasida turadi, har route'da
// alohida emas: shu modulga keyin qo'shiladigan har qanday endpoint
// avtomatik yopiq bo'ladi. Bitta route'da yozishni unutish - paywall'ni
// jimgina teshib qo'yishning eng oson yo'li.
//
// requireAuth'dan OLDIN qo'yilmaydi: tarifda yo'q ekanini bilish uchun
// ham avval kim so'rayotganini bilish shart emas, lekin xato kodi
// (402 vs 401) mantiqan aniqroq bo'lishi uchun tartib shunday qoldi -
// har route o'z requireAuth'ini o'zi chaqiradi.
//
// MUHIM: bu tekshiruv OCHIQ yiqiladi. Admin server bilan aloqa
// yo'qolsa entitlements keshida kalit bo'lmaydi va requireFeature "ha"
// deydi. Bu ataylab: to'lagan mijozning sahifasini bizning tarmoq
// muammomiz uchun o'chirib qo'yish mumkin emas. Xarajat esa bu yerda
// emas, byudjet qatlamida ushlanadi - u YOPIQ yiqiladi.
router.use(requireFeature(AI_FEATURE_KEY, "AI maslahatchi"));

// --- BRIFING: dashboardning asosiy so'rovi (AI_READ) ---
//
// To'rtta savolga (kecha / bugun / keyin / hozir) bitta javob. Sahifa
// shu endpointdan boshqa hech narsa so'ramaydi.
router.get(
  "/briefing",
  requireAuth,
  requirePermission(PERMISSIONS.AI_READ),
  validate(briefingSchema),
  briefing,
);

// --- REYTINGLAR: "eng ko'p kechiktirganlar / qoldirganlar / o'qituvchilar" ---
//
// Validator YO'Q: so'rov parametri yo'q (filial kontekstdan olinadi,
// limit tungi hisoblashda belgilanadi). Bo'sh zod sxemasi qo'shish
// hech narsani tekshirmagan holda yana bir fayl yaratardi.
router.get(
  "/rankings",
  requireAuth,
  requirePermission(PERMISSIONS.AI_READ),
  rankings,
);

// --- HISOBOTLAR (kunlik / haftalik / oylik) ---
//
// TARTIB MUHIM: "/reports/latest" "/reports/:id" DAN OLDIN turishi shart.
// Aks holda Express "latest" ni :id deb o'qiydi va ObjectId validatsiyasi
// 400 bilan yiqiladi.
router.get(
  "/reports/latest",
  requireAuth,
  requirePermission(PERMISSIONS.AI_READ),
  validate(latestReportSchema),
  latestReport,
);
router.get(
  "/reports",
  requireAuth,
  requirePermission(PERMISSIONS.AI_READ),
  validate(listReportsSchema),
  listReports,
);
router.get(
  "/reports/:id",
  requireAuth,
  requirePermission(PERMISSIONS.AI_READ),
  validate(reportIdSchema),
  getReport,
);

// --- O'qish (AI_READ) ---
router.get("/insights", requireAuth, requirePermission(PERMISSIONS.AI_READ), validate(listSchema), list);
// Modul paneli: "Moliya → AI Insights". Har bir modul o'z domenini oladi.
router.get(
  "/insights/domain/:domain",
  requireAuth,
  requirePermission(PERMISSIONS.AI_READ),
  validate(byDomainSchema),
  byDomain,
);
router.get(
  "/action-center",
  requireAuth,
  requirePermission(PERMISSIONS.AI_READ),
  validate(actionCenterSchema),
  actionCenter,
);
// POST, chunki 500 tagacha ID query string'ga sig'maydi (ro'yxat sahifasi
// barcha o'quvchilarning badge'ini bitta so'rovda oladi).
router.post(
  "/insights/by-subjects",
  requireAuth,
  requirePermission(PERMISSIONS.AI_READ),
  validate(bySubjectsSchema),
  bySubjects,
);

// --- Holatni o'zgartirish (AI_READ yetarli: bu kundalik ish oqimi) ---
router.post(
  "/insights/:id/ack",
  requireAuth,
  requirePermission(PERMISSIONS.AI_READ),
  validate(idParamSchema),
  acknowledge,
);
router.post(
  "/insights/:id/resolve",
  requireAuth,
  requirePermission(PERMISSIONS.AI_READ),
  validate(idParamSchema),
  resolve,
);
router.post(
  "/insights/:id/dismiss",
  requireAuth,
  requirePermission(PERMISSIONS.AI_READ),
  validate(dismissSchema),
  dismiss,
);

// --- Sozlamalar (AI_CONFIG - eng tor huquq: vaznlar BARCHA ballni siljitadi) ---
router.get(
  "/config",
  requireAuth,
  requirePermission(PERMISSIONS.AI_CONFIG),
  validate(getConfigSchema),
  getConfig,
);
router.put(
  "/config",
  requireAuth,
  requirePermission(PERMISSIONS.AI_CONFIG),
  validate(updateConfigSchema),
  updateConfig,
);
router.post(
  "/recompute",
  requireAuth,
  requirePermission(PERMISSIONS.AI_CONFIG),
  validate(recomputeSchema),
  recompute,
);

export default router;
