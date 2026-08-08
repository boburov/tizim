import mongoose from "mongoose";
import { ROLES } from "../constants/roles.js";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true, required: true },
    lastName: { type: String, trim: true, required: true },
    username: { type: String, trim: true, unique: true, required: true, lowercase: true },
    // TELEFON TAKRORLANISHI RUXSAT ETILADI (unique YO'Q - ataylab).
    //
    // Sabab lidlardagi bilan bir xil (qarang: leads.service.js create):
    // bitta raqam - bitta odam EMAS. Ona bitta raqamdan ikki farzandini
    // yozdiradi, aka-uka bitta telefondan foydalanadi, o'qituvchi o'z
    // farzandini shu markazga beradi. Eski unique indeks bu holatlarda
    // resepshinni BLOKLARDI va u odamni umuman kiritmasdan qo'yardi -
    // ya'ni qoida ma'lumotni tozalash o'rniga yo'qotardi.
    //
    // Raqam bo'yicha qidiruv (bot bog'lanishi, qidiruv paneli) uchun oddiy
    // indeks qoladi. Kirish LOGIN bo'yicha - telefon hech qachon
    // autentifikatsiya kaliti bo'lmagan, shuning uchun takrorlanish
    // xavfsizlikka ta'sir qilmaydi.
    phone: { type: String, trim: true, index: true },
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

    // OXIRGI KIRISH - faqat haqiqiy login'da yoziladi (token yangilanishida
    // EMAS). Xodimlar ro'yxati "kim tizimdan foydalanmoqda"ni shu maydondan
    // ko'radi.
    //
    // DIQQAT: RefreshToken'dan chiqarib bo'lmaydi - u 7 kunlik TTL bilan
    // o'chadi va har token rotatsiyasida yangi qator yaratiladi, ya'ni uning
    // createdAt'i "oxirgi faollik"ka siljib ketadi. ActivityLog ham yaramaydi:
    // /auth/login requireAuth'siz mount qilingan, shuning uchun login yozuvida
    // `user: null` turadi.
    lastLoginAt: { type: Date, default: null },

    // Profil ma'lumotlari (ixtiyoriy)
    birthDate: { type: Date, default: null },
    gender: { type: String, enum: ["male", "female"], default: null },

    // Faqat student rolidagi maydon
    enrolledAt: { type: Date, default: null },
    // QAYSI LIDDAN kelgan (konversiyada yoziladi). Resepshin KPI zanjirining
    // bo'g'ini: xodim -> lid -> o'quvchi -> davomat/to'lov -> mukofot.
    //
    // Lead.studentId teskari yo'nalishda ham bor, lekin KPI hisobi o'quvchidan
    // boshlanadi ("shu o'quvchi 30 kun qatnadi - kimga mukofot?") va har safar
    // lidlar kolleksiyasini skanerlash qimmat.
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
    },
    // O'qishni yakunlagan sana (avtomatik yoki qo'lda). null = hali yakunlamagan.
    completedAt: { type: Date, default: null },
    // completedAt owner tomonidan qo'lda o'rnatilganmi - avto-recompute uni bosib o'tmaydi.
    completedAtManual: { type: Boolean, default: false },

    // Faqat teacher rolidagi maydon.
    //
    // DIQQAT: bu HR MA'LUMOTI. Uni o'zgartirish maosh yaratmaydi va
    // maosh tarixini qayta hisoblamaydi - hisoblash HAR DOIM alohida,
    // qo'lda boshlanadigan amal. Chegara `payrollStartFrom` bilan
    // qo'yiladi (pastga qarang).
    hiredAt: { type: Date, default: null },

    // TIZIM QAYSI SANADAN BOSHLAB maosh hisoblaydi.
    //
    // NEGA hiredAt YETMAYDI: markazlar boshqa CRM'dan ko'chib keladi va
    // o'tgan oylarning maoshi ALLAQACHON to'langan bo'ladi. hiredAt esa
    // haqiqiy (masalan 2 yil oldingi) sana bo'lishi kerak - HR shuni
    // talab qiladi. Ikkisini bitta maydonga siqish "hiredAt ni to'g'rilash
    // = 16 oylik maosh yaratish" degan xavfli bog'lanishni tug'diradi.
    //
    // null = chegara yo'q (yangi markaz, hamma narsa shu tizimda).
    payrollStartFrom: { type: Date, default: null },
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
// Lid bo'yicha teskari qidiruv (KPI atributsiyasi).
userSchema.index({ leadId: 1 }, { sparse: true });

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
