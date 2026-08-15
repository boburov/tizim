import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId } from "../../../utils/serialize.js";

// Yagona qatorli sozlama (id = "default"). Mongo'da bu `_id: "default"` edi.
const DEFAULT_ID = "default";

// Klient `settings?._id` ni useEffect bog'liqligi sifatida ishlatadi
// (AttendanceSettingsPage.jsx). `_id` bo'lmasa bog'liqlik DOIM undefined
// bo'lib qoladi, effekt qayta ishlamaydi va forma saqlangan qiymatlarni
// umuman yuklamaydi — "Saqlash" esa standart qiymatlarni yozib yuborardi.
export const get = async () =>
  withLegacyId(
    await prisma.attendanceSettings.upsert({
      where: { id: DEFAULT_ID },
      update: {},
      create: { id: DEFAULT_ID },
    }),
  );

export const update = async (body) => {
  await get(); // qator borligiga kafolat

  const data = {};

  if (body.lowAttendanceThreshold !== undefined) {
    const v = Number(body.lowAttendanceThreshold);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      throw new ApiError(400, "Threshold 0 dan 100 gacha bo'lishi kerak");
    }
    data.lowAttendanceThreshold = v;
  }
  if (body.consecutiveAbsencesAlert !== undefined) {
    const v = Number(body.consecutiveAbsencesAlert);
    if (!Number.isInteger(v) || v < 1) {
      throw new ApiError(400, "Ketma-ket kunlar soni kamida 1 bo'lsin");
    }
    data.consecutiveAbsencesAlert = v;
  }

  return withLegacyId(
    await prisma.attendanceSettings.update({ where: { id: DEFAULT_ID }, data }),
  );
};
