// Maosh holati uchun UI yorlig'i va rang toni (StatusBadge tone'lari)
export const SALARY_STATUS = {
  unpaid: { label: "To'lanmagan", tone: "danger" },
  partial: { label: "Qisman to'langan", tone: "warning" },
  paid: { label: "To'langan", tone: "success" },
};

export const statusMeta = (status) => SALARY_STATUS[status] || SALARY_STATUS.unpaid;

export const methodLabel = (m) => (m === "cash" ? "Naqd" : "Karta");
