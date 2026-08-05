import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const scheduleItemSchema = new mongoose.Schema(
  {
    day: { type: String, enum: DAYS, required: true },
    startTime: {
      type: String,
      required: true,
      match: [TIME_REGEX, "Vaqt formati noto'g'ri (HH:mm)"],
    },
    endTime: {
      type: String,
      required: true,
      match: [TIME_REGEX, "Vaqt formati noto'g'ri (HH:mm)"],
    },
    // Jadval versiyalash: shu slot qaysi SANADAN boshlab amal qiladi.
    // null → boshidan (eski/legacy slotlar). Davomat hisobida har sana uchun
    // o'sha sanada AMAL QILGAN versiya ishlatiladi (tarixiy aniqlik), shunda
    // jadval keyin o'zgartirilsa eski kunlardagi dars soni shishmaydi.
    effectiveFrom: { type: Date, default: null },
  },
  { _id: false },
);

const groupSchema = new mongoose.Schema(
  {
    // FILIAL: guruh - filial ko'lamining ILDIZI. Davomat, baho, to'lov,
    // maosh kabi modellar guruh orqali filialga bog'lanadi, shuning uchun
    // bir guruh IKKI filialga tegishli bo'la olmaydi.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    name: { type: String, trim: true, required: true },

    // KURS (yo'nalish). null = biriktirilmagan (eski guruhlar yoki aralash
    // dastur). Hisobotda bunday guruhlar "Kursi belgilanmagan" qatoriga
    // tushadi - jimgina yo'qolmaydi.
    //
    // DIQQAT: kurs bo'yicha moliyaviy hisobot GURUH orqali filialga
    // bog'lanadi (Group.branchId), shuning uchun Course'ning o'zida
    // branchId kerak emas - course.model.js dagi izohga qarang.
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
      index: true,
    },

    schedule: { type: [scheduleItemSchema], default: [] },
    teachers: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    ],
    // Dars boshlanish sanasi - undan oldin davomat hisoblanmaydi.
    startDate: { type: Date, default: null },
    // Kurs tugash sanasi (inklyuziv oxirgi aktiv kun). Bo'sh/kelajak → aktiv;
    // o'tgan/bugun → kurs avtomatik arxivlangan, davr/membershiplar yopiladi.
    endDate: { type: Date, default: null, index: true },
    // Kurs davomiyligi (oy) - ma'lumot uchun (mas. 10 oylik / 12 oylik).
    durationMonths: { type: Number, default: null, min: 0 },

    // OY O'RTASIDA KIRISH SIYOSATI (billing).
    //
    // Guruh oyning 1-sanasidan boshlanmasa yoki o'quvchi oy o'rtasida
    // qo'shilsa, o'sha KIRISH oyi uchun qancha olinadi:
    //   "prorated" - faqat qolgan qism (oy rejasidagi darslar ulushicha)
    //   "full"     - to'liq oylik summa, qachon kirganidan qat'i nazar
    //
    // FAQAT KIRISHGA taalluqli. Chiqib ketish va muzlatish ikkala rejimda
    // ham proratsiya qilinaveradi - o'quvchidan olmagan xizmati uchun pul
    // undirish siyosat emas, xato bo'lardi.
    //
    // Standart "prorated" - mavjud xatti-harakat (o'quvchi oy o'rtasida
    // qo'shilganda ulushiga qarab to'laydi).
    entryBilling: {
      type: String,
      enum: ["prorated", "full"],
      default: "prorated",
    },
    // endDate'dan keltirib chiqarilgan hosila kesh: kurs hali tugamaganmi.
    // Guard/filtr/joblar shunga tayanadi; reconcileGroupEnd yangilab turadi.
    isActive: { type: Boolean, default: true, index: true },
    // Kurs tugashi yopgan o'qituvchi davrlari - reactivate aynan shularni ochadi.
    archivedClosedPeriods: [
      { type: mongoose.Schema.Types.ObjectId, ref: "TeacherGroupPeriod" },
    ],
    // Kurs tugashi yopgan o'quvchi a'zoliklari - reactivate aynan shularni ochadi.
    archivedClosedMemberships: [
      { type: mongoose.Schema.Types.ObjectId, ref: "GroupMembership" },
    ],
  },
  { timestamps: true },
);

groupSchema.index({ name: 1 });

const DAY_LABELS_UZ = {
  mon: "Dushanba",
  tue: "Seshanba",
  wed: "Chorshanba",
  thu: "Payshanba",
  fri: "Juma",
  sat: "Shanba",
  sun: "Yakshanba",
};

groupSchema.pre("validate", function (next) {
  // Bir kunda bir nechta dars (sessiya) bo'lishi mumkin. Versiyalash tufayli bir
  // xil (kun + boshlanish vaqti) turli effectiveFrom bilan takrorlanishi MUMKIN
  // (eski versiya + yangi versiya). Faqat bir xil (kun + vaqt + effectiveFrom)
  // takrorlanmasligi kerak.
  const seen = new Set();
  for (const item of this.schedule || []) {
    const effKey = item.effectiveFrom
      ? new Date(item.effectiveFrom).getTime()
      : "null";
    const key = `${item.day}-${item.startTime}-${effKey}`;
    if (seen.has(key)) {
      const label = DAY_LABELS_UZ[item.day] || item.day;
      return next(
        new Error(
          `Bir xil dars vaqti takrorlanmasligi kerak (${label} ${item.startTime})`,
        ),
      );
    }
    seen.add(key);
    if (item.startTime >= item.endTime) {
      return next(
        new Error(`Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak (${item.day})`),
      );
    }
  }
  next();
});

groupSchema.plugin(softDeletePlugin);

const Group = mongoose.model("Group", groupSchema);

export const GROUP_DAYS = DAYS;
export default Group;
