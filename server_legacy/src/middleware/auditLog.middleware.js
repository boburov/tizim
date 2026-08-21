import logger from "../config/logger.js";
import prisma from "../config/prisma.js";
import {
  sanitize,
  extractResource,
  truncateBody,
} from "../helpers/auditLog.helper.js";

const TRACKED_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

// Audit log faqat *ataylab qilingan* amallarni yozishi kerak.
// Token yangilash - fon jarayoni, u jadvalni to'ldirib, haqiqiy hodisalarni
// ko'rinmas qilib qo'yadi. Shuning uchun yozish bosqichidayoq tashlab ketamiz.
const IGNORED_PATHS = new Set(["/api/auth/refresh", "/auth/refresh"]);

const isIgnored = (req) => {
  const path = String(req.originalUrl || req.path || "").split("?")[0];
  return IGNORED_PATHS.has(path);
};

// user null bo'lganda (login - hali autentifikatsiya bo'lmagan so'rov)
// hech bo'lmasa kim urinayotganini saqlaymiz.
const extractActorLabel = (req) => {
  if (req.user) return "";
  const body = req.body || {};
  return String(body.login || body.username || body.phone || "").slice(0, 120);
};

const auditLog = (req, res, next) => {
  if (!TRACKED_METHODS.has(req.method)) return next();
  if (isIgnored(req)) return next();
  const startedAt = Date.now();
  // req.body handler'lar tomonidan o'zgartirilishi mumkin - hozir o'qib olamiz
  const actorLabel = extractActorLabel(req);

  res.on("finish", () => {
    setImmediate(async () => {
      try {
        const sanitized = sanitize(req.body || {});
        const safeBody = truncateBody(sanitized);
        const resource = extractResource(req.originalUrl || req.path);

        await prisma.activityLog.create({
          data: {
            // `user` -> `userId`: Prisma'da `user` RELATION.
            userId: req.user?._id ? String(req.user._id) : null,
            userRole: req.user?.role || "system",
            actorLabel,
            method: req.method,
            path: req.originalUrl || req.path,
            status: res.statusCode || 0,
            durationMs: Date.now() - startedAt,
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
            // `body` ustuni `Json?` - `undefined` yozib bo'lmaydi.
            body: safeBody ?? null,
            resourceType: resource.type,
            resourceId: resource.id,
          },
        });
      } catch (err) {
        logger.warn(
          { err, path: req.originalUrl, method: req.method },
          "AuditLog yozib bo'lmadi",
        );
      }
    });
  });

  next();
};

export default auditLog;
