// Maosh holati uchun UI yorlig'i va rang toni
export const SALARY_STATUS = {
  unpaid: { label: "To'lanmagan", tone: "danger" },
  partial: { label: "Qisman", tone: "warning" },
  paid: { label: "To'langan", tone: "success" },
};

export const statusMeta = (status) => SALARY_STATUS[status] || SALARY_STATUS.unpaid;

export const SALARY_TYPE_LABEL = {
  fixed: "Fiksa",
  percent: "Foiz",
  mixed: "Aralash",
};

// Qator TURI (kind) - "bu summa qayerdan keldi?" degan savolga javob.
// group/base - hisoblangan maosh, bonus/deduction - qo'lda yozilgan qator,
// opening - tizimdan oldingi qoldiq.
export const SALARY_KIND_LABEL = {
  group: "Guruh maoshi",
  base: "Fiksa oylik",
  bonus: "Mukofot",
  deduction: "Jarima",
  opening: "Boshlang'ich qoldiq",
};

// Qo'lda yozilgan (mukofot/jarima) qatorlarni ajratish - ular boshqacha
// ko'rsatiladi va boshqa amallarga ega (to'lov emas, o'chirish).
export const isAdjustmentKind = (kind) =>
  kind === "bonus" || kind === "deduction";
