import mongoose from "mongoose";
import env from "../config/env.js";
import logger from "../config/logger.js";
import { setEntitlements } from "../config/entitlements.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import { ROLES } from "../constants/roles.js";
import { monthlyUsage } from "../modules/ai/services/aiBudget.service.js";

export const JOB_NAME = "usage.heartbeat";

/**
 * Admin panelga foydalanish (usage) ma'lumotlarini yuboradi va javobda
 * tarif limitlarini oladi (keshga yozadi).
 *
 * PUSH modeli tanlangan: admin server har tenant MongoDB'siga ulanmaydi,
 * aksincha har tenant o'zi haqida xabar beradi. Shunda admin serverda
 * hamma tenantlarning DB parollari saqlanmaydi.
 *
 * MUHIM: soft-delete plugin avtomatik filtr QO'YMAYDI, shuning uchun
 * isDeleted ni har so'rovda ochiq filtrlaymiz — aks holda arxivlangan
 * yozuvlar ham limitga kirib ketardi.
 */
export async function collectMetrics() {
  const notDeleted = { isDeleted: { $ne: true } };

  const [userCount, studentCount, teacherCount, groupCount, activeGroupCount] =
    await Promise.all([
      // Talabalardan tashqari hamma (owner + xodim + o'qituvchi)
      User.countDocuments({ ...notDeleted, role: { $ne: ROLES.STUDENT } }),
      User.countDocuments({ ...notDeleted, role: ROLES.STUDENT }),
      User.countDocuments({ ...notDeleted, role: ROLES.TEACHER }),
      Group.countDocuments(notDeleted),
      Group.countDocuments({ ...notDeleted, isActive: true }),
    ]);

  const metrics = {
    user_count: userCount,
    student_count: studentCount,
    teacher_count: teacherCount,
    group_count: groupCount,
    active_group_count: activeGroupCount,
  };

  // AI izoh chaqiruvlari (joriy oy). Admin panelda tarif limiti bilan
  // yonma-yon ko'rinadi: "3 120 / 4 000".
  //
  // Bu metrika BOSHQALARIDAN FARQ QILADI: qolganlari mijozning hajmini
  // o'lchaydi, bu esa BIZNING xarajatimizni. Shuning uchun u tannarxni
  // ko'radigan yagona oyna - qaysi tenant qanchaga tushayotganini
  // Google hisobini ochmasdan bilish uchun.
  try {
    const ai = await monthlyUsage();
    metrics.ai_calls_month = ai.calls;
  } catch (err) {
    logger.debug({ err: err.message }, "AI usage metrikasi olinmadi");
  }

  // Baza hajmi (MB) — mavjud bo'lsa qo'shamiz, xato bo'lsa o'tkazib yuboramiz
  try {
    const stats = await mongoose.connection.db.stats();
    if (stats && Number.isFinite(stats.dataSize)) {
      metrics.storage_mb = Math.round(stats.dataSize / (1024 * 1024));
    }
  } catch (err) {
    logger.debug({ err: err.message }, "db.stats() olinmadi");
  }

  return metrics;
}

/** Heartbeat sozlanganmi (lokal dev'da odatda yo'q). */
export function isHeartbeatConfigured() {
  return Boolean(env.ADMIN_API_URL && env.TENANT_ID && env.HEARTBEAT_SECRET);
}

export async function sendHeartbeat() {
  if (!isHeartbeatConfigured()) return null;

  const url = `${env.ADMIN_API_URL.replace(/\/$/, "")}/tenant-api/${env.TENANT_ID}/heartbeat`;
  const metrics = await collectMetrics();

  // Admin server javob bermasa tenant ishlashda davom etishi kerak —
  // shuning uchun timeout qo'yamiz va xatoni yutamiz (log qoladi).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-heartbeat-secret": env.HEARTBEAT_SECRET,
      },
      body: JSON.stringify({ metrics }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, body: text.slice(0, 200) },
        "Heartbeat rad etildi",
      );
      return null;
    }

    const data = await res.json();
    setEntitlements(data);
    logger.debug({ metrics, planKey: data?.planKey }, "Heartbeat yuborildi");
    return data;
  } catch (err) {
    // Aloqa yo'q — bu kutilgan holat (admin server o'chgan/tarmoq uzilgan).
    logger.warn({ err: err.message }, "Heartbeat yuborilmadi");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default function defineUsageHeartbeat(agenda) {
  agenda.define(JOB_NAME, async () => {
    await sendHeartbeat();
  });
}
