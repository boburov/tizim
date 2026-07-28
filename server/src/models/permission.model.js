import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, required: true, lowercase: true, trim: true },
    label: { type: String, required: true, trim: true },
    group: { type: String, default: "general", trim: true, lowercase: true },

    // --- Matritsa (module x action) metadata ---
    // key = "<module>.<action>" bo'lgani uchun ikkalasi ham key'dan chiqadi,
    // lekin UI jadvalini qurish uchun alohida maydon sifatida saqlanadi:
    // module = qator, action = ustun.
    module: { type: String, required: true, trim: true, lowercase: true, index: true },
    action: { type: String, required: true, trim: true, lowercase: true },
    // Qatorning ko'rinadigan nomi ("Foydalanuvchilar") va tartibi.
    moduleLabel: { type: String, trim: true },
    moduleOrder: { type: Number, default: 100 },
  },
  { timestamps: true },
);

// Bitta modulda bitta action faqat bir marta bo'ladi (matritsa katagi noyob).
permissionSchema.index({ module: 1, action: 1 }, { unique: true });

const Permission = mongoose.model("Permission", permissionSchema);

export default Permission;
