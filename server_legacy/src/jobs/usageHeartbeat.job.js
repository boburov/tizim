import env from "../config/env.js";
import logger from "../config/logger.js";
import { setEntitlements } from "../config/entitlements.js";
import prisma from "../config/prisma.js";
import { ROLES } from "../constants/roles.js";
import { monthlyUsage } from "../modules/ai/services/aiBudget.service.js";

export const JOB_NAME = "usage.heartbeat";

export async function collectMetrics() {
  const notDeleted = { isDeleted: false };

  const [userCount, studentCount, teacherCount, groupCount, activeGroupCount] =
    await Promise.all([
      prisma.user.count({ where: { ...notDeleted, role: { not: ROLES.STUDENT } } }),
      prisma.user.count({ where: { ...notDeleted, role: ROLES.STUDENT } }),
      prisma.user.count({ where: { ...notDeleted, role: ROLES.TEACHER } }),
      prisma.group.count({ where: notDeleted }),
      prisma.group.count({ where: { ...notDeleted, isActive: true } }),
    ]);

  const metrics = {
    user_count: userCount,
    student_count: studentCount,
    teacher_count: teacherCount,
    group_count: groupCount,
    active_group_count: activeGroupCount,
  };

  try {
    const ai = await monthlyUsage();
    metrics.ai_calls_month = ai.calls;
  } catch (err) {
    logger.debug({ err: err.message }, "AI usage metrikasi olinmadi");
  }

  try {
    const result = await prisma.$queryRaw`SELECT pg_database_size(current_database()) as size`;
    if (result && result[0] && result[0].size) {
      metrics.storage_mb = Math.round(Number(result[0].size) / (1024 * 1024));
    }
  } catch (err) {
    logger.debug({ err: err.message }, "db.stats() olinmadi");
  }

  return metrics;
}

export function isHeartbeatConfigured() {
  return Boolean(env.ADMIN_API_URL && env.TENANT_ID && env.HEARTBEAT_SECRET);
}

export async function sendHeartbeat() {
  if (!isHeartbeatConfigured()) return null;

  const url = `${env.ADMIN_API_URL.replace(/\/$/, "")}/tenant-api/${env.TENANT_ID}/heartbeat`;
  const metrics = await collectMetrics();

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
