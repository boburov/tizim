import mongoose from "mongoose";

/**
 * Avto-tozalash chastotasi va uning kunlardagi qadami.
 *
 * Cron ATAYLAB ishlatilmadi: job har kuni bir marta yuradi va shu yerdagi
 * qadamga qarab "vaqti keldimi" deb qaraydi. Sabab - chastota sozlamadan
 * o'zgaradi, cron esa ishga tushish paytida bir marta ro'yxatga olinadi.
 * Sozlama o'zgarganda cronni qayta yozish kerak bo'lardi va server qayta
 * ishga tushmaguncha eski jadval qolib ketardi.
 */
export const CLEANUP_FREQUENCIES = ["weekly", "monthly", "semiannual"];

export const FREQUENCY_DAYS = {
  weekly: 7,
  monthly: 30,
  semiannual: 182,
};

const storageSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "default" },

    // Avto-tozalash yoqilganmi. Standart - O'CHIQ: fayllarni o'z-o'zidan
    // o'chiradigan tizim OCHIQ e'lon qilinishi kerak, jimgina emas.
    autoCleanupEnabled: { type: Boolean, default: false },

    // Qanchalik tez-tez yuradi.
    frequency: { type: String, enum: CLEANUP_FREQUENCIES, default: "monthly" },

    // Nechа kundan eski fayl "eskirgan" hisoblanadi.
    // 180 kun (~6 oy) - o'quv yili davomida yuborilgan vazifa saqlanib
    // qolishi uchun yetarli darajada uzun standart.
    olderThanDays: { type: Number, min: 1, max: 3650, default: 180 },

    lastRunAt: { type: Date, default: null },
    // Oxirgi yurishda nechta fayl o'chdi va qancha joy bo'shadi -
    // sahifada "avto-tozalash ishlayaptimi" degan savolga javob.
    lastRunDeleted: { type: Number, default: 0, min: 0 },
    lastRunFreedBytes: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, _id: false },
);

storageSettingsSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const StorageSettings = mongoose.model("StorageSettings", storageSettingsSchema);

export default StorageSettings;
