import mongoose from "mongoose";
import { ROLES } from "../constants/roles.js";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true, required: true },
    lastName: { type: String, trim: true, required: true },
    username: { type: String, trim: true, unique: true, required: true, lowercase: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    // DIQQAT: loyiha talabiga ko'ra parol OCHIQ MATNDA saqlanadi (hash YO'Q).
    // Maydon nomi tarixiy sabablarga ko'ra passwordHash bo'lib qoldi, lekin
    // ichida ochiq parol turadi. select:false - oddiy so'rovlarda chiqmaydi,
    // owner uni faqat /:id/password endpoint orqali ataylab oladi.
    passwordHash: { type: String, required: true, select: false },
    // Rol DINAMIK: Role collection'idagi ixtiyoriy value bo'lishi mumkin
    // (built-in owner/teacher/student yoki owner yaratgan custom rol).
    // Rolning mavjudligi service qatlamida tekshiriladi - bu yerda enum YO'Q,
    // aks holda custom rol saqlanmaydi.
    role: {
      type: String,
      default: ROLES.STUDENT,
      required: true,
      lowercase: true,
      trim: true,
    },
    // --- FILIAL (multi-branch) ---
    // DIQQAT: yuqoridagi `role` maydoni SAQLANADI va asosiy rol bo'lib
    // qoladi. U 50+ joyda o'qiladi, JWT ichida yuriladi va
    // roles.service.js'da updateMany bilan ommaviy ko'chiriladi -
    // uni branchAssignments bilan ALMASHTIRISH juda xavfli bo'lardi.
    // branchAssignments faqat QO'SHIMCHA: qaysi filialda qaysi rol.
    //
    // homeBranchId - foydalanuvchining asosiy filiali. Yangi hujjatlar
    // (guruh, to'lov, davomat) standart holatda shunga biriktiriladi.
    homeBranchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },
    // Qo'shimcha filiallar: o'qituvchi 2 filialda dars bersa yoki
    // direktor bir nechta filialni boshqarsa. Har birida O'Z roli bo'lishi
    // mumkin (masalan A filialda "director", B filialda "teacher").
    // Bo'sh bo'lsa - foydalanuvchi faqat homeBranchId'da ishlaydi.
    branchAssignments: {
      type: [
        {
          _id: false,
          branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
          },
          // Bo'sh bo'lsa yuqoridagi `role` ishlatiladi.
          role: { type: String, lowercase: true, trim: true, default: null },
        },
      ],
      default: [],
    },

    isActive: { type: Boolean, default: true },
    // Arxivlangan (isActive=false qilingan) payt. Tiklanganda null bo'ladi.
    archivedAt: { type: Date, default: null },

    // Profil ma'lumotlari (ixtiyoriy)
    birthDate: { type: Date, default: null },
    gender: { type: String, enum: ["male", "female"], default: null },

    // Faqat student rolidagi maydon
    enrolledAt: { type: Date, default: null },
    // O'qishni yakunlagan sana (avtomatik yoki qo'lda). null = hali yakunlamagan.
    completedAt: { type: Date, default: null },
    // completedAt owner tomonidan qo'lda o'rnatilganmi - avto-recompute uni bosib o'tmaydi.
    completedAtManual: { type: Boolean, default: false },

    // Faqat teacher rolidagi maydon
    hiredAt: { type: Date, default: null },
    // ISHDAN BO'SHAGAN sana (EXCLUSIVE - shu kundan boshlab ishlamaydi).
    // Maosh proratsiyasi shu chegaragacha hisoblanadi va ochiq
    // TeacherGroupPeriod/TeacherCompensation davrlari shu sanada yopiladi.
    // null = hali ishlayapti.
    terminatedAt: { type: Date, default: null },
    terminationReason: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

// Rol HECH QACHON bo'sh bo'lmasligi kerak.
// DIQQAT: bu yerda "noma'lum rol -> student" QILINMAYDI. Rollar dinamik
// bo'lgani uchun custom rol ("buxgalter") bu hookka noma'lum ko'rinadi va
// jimgina student'ga aylanib qolardi. Rol haqiqiyligi service qatlamida
// (roles.helper.js -> assertRoleAssignable) tekshiriladi.
userSchema.pre("validate", function ensureRole(next) {
  if (!this.role) this.role = ROLES.STUDENT;
  next();
});

// FILIAL bo'yicha ro'yxat so'rovlari uchun.
// $or ikki shoxli: homeBranchId YOKI branchAssignments.branchId - MongoDB
// har shox uchun alohida indeks ishlatadi, shuning uchun ikkalasi ham kerak.
userSchema.index({ homeBranchId: 1, isDeleted: 1, isActive: 1 });
userSchema.index({ "branchAssignments.branchId": 1, isDeleted: 1, isActive: 1 });

userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.plainPassword; // legacy hujjatlar uchun himoya
    delete ret.__v;
    return ret;
  },
});

userSchema.plugin(softDeletePlugin);

const User = mongoose.model("User", userSchema);

export default User;
