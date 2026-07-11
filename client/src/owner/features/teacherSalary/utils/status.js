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
