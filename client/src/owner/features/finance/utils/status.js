// To'lov holati uchun UI yorlig'i va rang toni
export const PAYMENT_STATUS = {
  unpaid: { label: "To'lanmagan", tone: "danger" },
  partial: { label: "Qisman", tone: "warning" },
  paid: { label: "To'langan", tone: "success" },
};

export const statusMeta = (status) =>
  PAYMENT_STATUS[status] || PAYMENT_STATUS.unpaid;
