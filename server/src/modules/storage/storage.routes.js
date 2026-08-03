import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import usage from "./handlers/usage.handler.js";

const router = Router();

// Kvota holati. requirePermission ATAYLAB yo'q: bu raqamni sidebar
// ko'rsatadi va u markazning umumiy holati (kimningdir shaxsiy ma'lumoti
// emas). Ruxsat qo'yilsa, o'qituvchi joy tugaganini faqat fayl yuklab
// ko'rgandan keyin bilib olardi.
router.get("/usage", requireAuth, usage);

export default router;
