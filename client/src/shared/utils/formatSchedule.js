export const DAY_LABELS_UZ = Object.freeze({
  mon: "Du",
  tue: "Se",
  wed: "Ch",
  thu: "Pa",
  fri: "Ju",
  sat: "Sh",
  sun: "Ya",
});

export const DAY_LABELS_FULL_UZ = Object.freeze({
  mon: "Dushanba",
  tue: "Seshanba",
  wed: "Chorshanba",
  thu: "Payshanba",
  fri: "Juma",
  sat: "Shanba",
  sun: "Yakshanba",
});

export const DAY_OPTIONS = Object.entries(DAY_LABELS_FULL_UZ).map(
  ([value, label]) => ({ value, label }),
);

// Hafta kunlari tartibi (Du -> Ya), saralash uchun
const DAY_ORDER = Object.freeze({
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
});

// Sanani UTC-yarim tun timestampiga keltiradi (backend toUtcMidnight bilan mos)
const dayTs = (d) => {
  const dt = new Date(d);
  return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
};

// Versiyalash: berilgan sanada (default - bugun) AMAL QILGAN jadval versiyasini
// qaytaradi. Har kun uchun effectiveFrom <= sana bo'lgan slotlardan eng so'nggi
// effectiveFrom ga ega bo'lganlari (null = boshidan). Backend scheduleActiveOn
// bilan bir xil mantiq.
export const scheduleActiveOn = (schedule = [], onDate = null) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return [];
  const target = onDate ? dayTs(onDate) : dayTs(new Date());
  const effTs = (it) =>
    it.effectiveFrom ? dayTs(it.effectiveFrom) : -Infinity;

  const latestEffByDay = new Map();
  for (const it of schedule) {
    const ts = effTs(it);
    if (ts > target) continue;
    const cur = latestEffByDay.get(it.day);
    if (cur === undefined || ts > cur) latestEffByDay.set(it.day, ts);
  }
  return schedule.filter((it) => {
    const ts = effTs(it);
    if (ts > target) return false;
    return latestEffByDay.get(it.day) === ts;
  });
};

// Jadvalni hafta kuni, so'ng boshlanish vaqti bo'yicha saralaydi (nusxa qaytaradi).
// Ko'rsatish uchun - faqat HOZIR amal qilayotgan versiyani qaytaradi (versiyalash).
export const sortSchedule = (schedule = []) => {
  if (!Array.isArray(schedule)) return [];
  return [...scheduleActiveOn(schedule)].sort((a, b) => {
    const da = DAY_ORDER[a.day] || 99;
    const db = DAY_ORDER[b.day] || 99;
    if (da !== db) return da - db;
    return String(a.startTime || "").localeCompare(String(b.startTime || ""));
  });
};

export const formatSchedule = (schedule = []) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return "-";
  return sortSchedule(schedule)
    .map((s) => `${DAY_LABELS_UZ[s.day] || s.day} ${s.startTime}–${s.endTime}`)
    .join(", ");
};

// Bir xil vaqtli kunlarni birlashtiradi: [{ days: ["Du","Se"], time: "14:00–15:30" }]
export const groupScheduleByTime = (schedule = []) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return [];
  const byTime = new Map();
  for (const s of sortSchedule(schedule)) {
    const time = `${s.startTime}–${s.endTime}`;
    if (!byTime.has(time)) byTime.set(time, []);
    byTime.get(time).push(DAY_LABELS_UZ[s.day] || s.day);
  }
  return Array.from(byTime, ([time, days]) => ({ time, days }));
};
