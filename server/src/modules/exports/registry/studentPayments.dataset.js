import { z } from "zod";
import { PERMISSIONS } from "../../../constants/permissions.js";
import * as studentPaymentService from "../../finance/services/studentPayment.service.js";

const STATUS_LABELS = {
  unpaid: "To'lanmagan",
  partial: "Qisman",
  paid: "To'langan",
};

// O'QUVCHI TO'LOVLARI - Excel eksport tavsifi.
//
// NEGA fetchPage mavjud servisni chaqiradi va o'z query'sini YOZMAYDI:
// studentPayment.service.list() allaqachon branchFilter() ni qo'llaydi.
// Bu yerda yangi StudentPayment.find() yozilsa, filial filtri unutilishi
// mumkin va eksport jimgina boshqa filial to'lovlarini ochib qo'yardi.
// Qoida: eksport HECH QACHON o'z so'rovini yozmaydi.
const studentPaymentsDataset = {
  key: "student-payments",
  label: "O'quvchi to'lovlari",
  // Faylning ASCII nomi (Content-Disposition uchun).
  fileBase: "oquvchi-tolovlari",
  sheetName: "To'lovlar",
  permission: PERMISSIONS.FINANCE_READ,

  // Jadval sahifasidagi filtrlar bilan bir xil. page/limit ATAYLAB yo'q -
  // eksport doim butun natijani oladi, sahifani emas.
  filterSchema: z.object({
    groupId: z.string().optional(),
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    status: z.enum(["unpaid", "partial", "paid"]).optional(),
    search: z.string().trim().optional(),
  }),

  columns: [
    { key: "studentName", header: "Ism familiya", width: 28, type: "text", default: true },
    { key: "username", header: "Login", width: 16, type: "text", default: false },
    // TELEFON ataylab alohida ruxsat ostida: moliyani ko'rish huquqi
    // o'quvchilar telefon bazasini yuklab olish huquqini BERMASLIGI kerak.
    {
      key: "studentPhone",
      header: "Telefon",
      width: 16,
      type: "text",
      default: false,
      permission: PERMISSIONS.STUDENTS_READ,
    },
    { key: "groupName", header: "Guruh", width: 22, type: "text", default: true },
    { key: "year", header: "Yil", width: 8, type: "int", default: true },
    { key: "month", header: "Oy", width: 8, type: "int", default: true },
    { key: "baseFee", header: "Asosiy narx (so'm)", width: 18, type: "money", default: false },
    { key: "discountApplied", header: "Chegirma (so'm)", width: 16, type: "money", default: false },
    { key: "expectedAmount", header: "Hisoblangan (so'm)", width: 18, type: "money", default: true },
    { key: "paidAmount", header: "To'langan (so'm)", width: 18, type: "money", default: true },
    { key: "remaining", header: "Qoldiq (so'm)", width: 16, type: "money", default: true },
    { key: "statusLabel", header: "Holat", width: 14, type: "text", default: true },
    { key: "writtenOff", header: "Hisobdan chiqarilgan", width: 20, type: "text", default: false },
    { key: "writeOffAmount", header: "Yomon qarz (so'm)", width: 18, type: "money", default: false },
    { key: "createdAt", header: "Yaratilgan", width: 14, type: "date", default: false },
  ],

  fetchPage: ({ filters, page, limit }) =>
    studentPaymentService.list({ ...filters, page, limit }),

  mapRow: (doc) => {
    const expected = doc.expectedAmount || 0;
    const paid = doc.paidAmount || 0;
    return {
      studentName: [doc.student?.firstName, doc.student?.lastName]
        .filter(Boolean)
        .join(" "),
      username: doc.student?.username || "",
      studentPhone: doc.student?.phone || "",
      groupName: doc.group?.name || "",
      year: doc.year,
      month: doc.month,
      baseFee: doc.baseFee || 0,
      discountApplied: doc.discountApplied || 0,
      expectedAmount: expected,
      paidAmount: paid,
      remaining: Math.max(0, expected - paid),
      statusLabel: STATUS_LABELS[doc.status] || doc.status || "",
      writtenOff: doc.writtenOff ? "Ha" : "Yo'q",
      writeOffAmount: doc.writeOffAmount || 0,
      createdAt: doc.createdAt || null,
    };
  },
};

export default studentPaymentsDataset;
