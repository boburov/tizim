// Server javobidagi `details: [{path, message}]` ni o'qib aniq xatoliklarni qaytaradi.
// Aks holda umumiy `message` ga qaytadi. Hech narsa topilmasa - fallback.

import { toast } from "sonner";

const FIELD_LABELS = {
  // umumiy
  name: "Nom",
  username: "Login",
  password: "Parol",
  phone: "Telefon",
  email: "Email",
  firstName: "Ism",
  lastName: "Familiya",
  birthDate: "Tug'ilgan sana",
  gender: "Jins",
  address: "Manzil",
  parentName: "Ota-ona ismi",
  parentPhone: "Ota-ona telefoni",
  // guruh
  schedule: "Jadval",
  teachers: "O'qituvchilar",
  startTime: "Boshlanish vaqti",
  endTime: "Tugash vaqti",
  day: "Kun",
  // davomat
  date: "Sana",
  status: "Holat",
  reason: "Sabab",
  // lid
  source: "Manba",
  // umumiy ref
  student: "O'quvchi",
  group: "Guruh",
  teacher: "O'qituvchi",
  role: "Rol",
};

const labelFor = (rawPath) => {
  if (!rawPath) return "";
  const parts = String(rawPath).split(".");
  const leaf = parts[parts.length - 1];
  return FIELD_LABELS[leaf] || leaf;
};

// Zod path: "body.name" → "name", "body.schedule.0.day" → "schedule[1] / day"
const cleanPath = (rawPath) => {
  if (!rawPath) return "";
  return String(rawPath).replace(/^body\./, "").replace(/^query\./, "").replace(/^params\./, "");
};

export const extractApiErrorMessage = (
  err,
  fallback = "Xatolik yuz berdi",
) => {
  const data = err?.response?.data;
  if (!data) return err?.message || fallback;

  // Zod / mongoose validation - field-level
  if (Array.isArray(data.details) && data.details.length > 0) {
    const lines = data.details
      .map((d) => {
        const path = cleanPath(d.path);
        const label = labelFor(path);
        if (label && d.message) return `${label}: ${d.message}`;
        return d.message || path;
      })
      .filter(Boolean);
    if (lines.length === 1) return lines[0];
    if (lines.length > 1) return lines.join(" • ");
  }

  // Duplicate key (Mongo 11000)
  if (data.code === "DUPLICATE" && data.details) {
    const fields = Object.keys(data.details);
    if (fields.length > 0) {
      const labels = fields.map(labelFor).join(", ");
      return `${labels}: bu qiymat allaqachon mavjud`;
    }
  }

  return data.message || fallback;
};

// Ko'p ishlatiladigan qisqartma - toast ko'rsatadi.
export const apiErrorToast = (err, fallback = "Xatolik yuz berdi") => {
  const msg = extractApiErrorMessage(err, fallback);
  toast.error(msg);
  return msg;
};
