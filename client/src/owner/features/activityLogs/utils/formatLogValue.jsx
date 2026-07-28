import { formatDateUz } from "@/shared/utils/formatDate";

// So'rov tanasidagi (body) texnik kalitlarni o'zbekcha nomga aylantirish.
// Admin "schedule" emas, "Dars jadvali" ko'rishi kerak.
const FIELD_LABELS = {
  name: "Nomi",
  firstName: "Ismi",
  lastName: "Familiyasi",
  username: "Login",
  phone: "Telefon",
  role: "Roli",
  password: "Parol",
  isActive: "Faol holati",
  schedule: "Dars jadvali",
  startDate: "Boshlanish sanasi",
  endDate: "Tugash sanasi",
  effectiveFrom: "Amal qilish sanasi",
  durationMonths: "Davomiyligi (oy)",
  teachers: "O'qituvchilar",
  students: "Talabalar",
  studentId: "Talaba",
  groupId: "Guruh",
  teacherId: "O'qituvchi",
  status: "Holati",
  date: "Sana",
  comment: "Izoh",
  note: "Eslatma",
  title: "Sarlavha",
  message: "Xabar",
  text: "Matn",
  type: "Turi",
  reason: "Sababi",
  amount: "Miqdori",
  price: "Narxi",
  day: "Kun",
  startTime: "Boshlanish vaqti",
  endTime: "Tugash vaqti",
};

const DAY_LABELS = {
  mon: "Dushanba",
  tue: "Seshanba",
  wed: "Chorshanba",
  thu: "Payshanba",
  fri: "Juma",
  sat: "Shanba",
  sun: "Yakshanba",
};

const STATUS_LABELS = {
  present: "Keldi",
  absent: "Kelmadi",
  late: "Kechikdi",
  excused: "Sababli",
  active: "Faol",
  inactive: "Nofaol",
  pending: "Kutilmoqda",
};

const ROLE_LABELS = {
  owner: "Egasi",
  teacher: "O'qituvchi",
  student: "Talaba",
  system: "Tizim",
};

export const fieldLabel = (key) => FIELD_LABELS[key] || key;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/;

// Bitta qiymatni o'qishga qulay matnga aylantiradi
export const formatValue = (key, value) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Ha" : "Yo'q";

  if (typeof value === "string") {
    if (key === "day") return DAY_LABELS[value] || value;
    if (key === "status") return STATUS_LABELS[value] || value;
    if (key === "role") return ROLE_LABELS[value] || value;
    if (value === "[REDACTED]") return "••••••• (yashirilgan)";
    if (ISO_DATE.test(value)) return formatDateUz(value);
    return value;
  }

  if (typeof value === "number") return String(value);
  return null; // obyekt/massiv - chaqiruvchi alohida render qiladi
};

// Dars jadvali kabi obyektlar massivini bitta qatorga jamlaydi:
// [{day:"sun",startTime:"14:00",endTime:"15:30"}] -> "Yakshanba 14:00–15:30"
export const summarizeScheduleItem = (item) => {
  if (!item || typeof item !== "object") return String(item);
  const day = DAY_LABELS[item.day] || item.day || "";
  const from = item.startTime || "";
  const to = item.endTime || "";
  const time = from && to ? `${from}–${to}` : from || to;
  return [day, time].filter(Boolean).join(" ") || "—";
};
