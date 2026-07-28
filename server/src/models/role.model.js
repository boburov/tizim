import mongoose from "mongoose";
import {
  ALL_ROLE_TYPES,
  ROLE_TYPES,
  DEFAULT_ROLE_PATH,
  isSystemRoleValue,
} from "../constants/roles.js";
// Permission modeli ref ishlatiladi - populate uchun registratsiya shart
import "./permission.model.js";

// Rollar DINAMIK: 3 ta built-in rol (owner/teacher/student) isSystem=true
// bilan seed qilinadi, qolganini owner UI orqali yaratadi.
const roleSchema = new mongoose.Schema(
  {
    // Slug: "owner", "buxgalter". Yaratilgandan keyin o'zgarmaydi.
    value: { type: String, unique: true, required: true, lowercase: true, trim: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },

    permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Permission" }],

    // Built-in rol: o'chirib/muzlatib bo'lmaydi, value o'zgarmaydi.
    isSystem: { type: Boolean, default: false },

    // Xatti-harakat shabloni - scope logikasi shunga tayanadi.
    roleType: { type: String, enum: ALL_ROLE_TYPES, default: ROLE_TYPES.STAFF, required: true },

    // Login'dan keyin tushadigan sahifa (ROLE_HOME o'rniga).
    defaultPath: { type: String, trim: true, default: DEFAULT_ROLE_PATH },

    // --- Muzlatish (freeze) ---
    // isFrozen=true bo'lsa: shu roldagi foydalanuvchi tizimga KIRA OLMAYDI
    // (login rad etiladi, mavjud sessiya ham requireAuth'da uziladi).
    isFrozen: { type: Boolean, default: false },
    frozenAt: { type: Date, default: null },
    frozenBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    frozenReason: { type: String, trim: true, default: "" },

    // Permission to'plami o'zgarganda oshadi - client cache'ni yangilashi
    // uchun signal (/auth/me shu raqamni qaytaradi).
    permissionsVersion: { type: Number, default: 1 },
  },
  { timestamps: true },
);

// Built-in rol hech qachon muzlatilmasin/o'chirilmasin - modelning o'zi
// kafolatlaydi (service qatlamidan tashqari ikkinchi himoya).
roleSchema.pre("validate", function guardSystemRole(next) {
  if (isSystemRoleValue(this.value)) {
    this.isSystem = true;
    this.isFrozen = false;
    this.frozenAt = null;
    this.frozenBy = null;
    this.frozenReason = "";
  }
  next();
});

const Role = mongoose.model("Role", roleSchema);

export default Role;
