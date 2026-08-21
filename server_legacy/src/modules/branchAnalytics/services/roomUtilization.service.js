import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import {
  branchFilter,
  isBranchAllowed,
} from "../../../helpers/branchContext.helper.js";
// ASOSIY HISOB PRIMITIVLARI — MOLIYA KESIMI BILAN BIR XIL MANBA.
//
// `helpers/roomOccupancy.helper.js` ni `/finance-analytics/rooms` ham
// ishlatadi. Ular nusxa bo'lsa, ikki ekran bir xil xona uchun ikki xil
// foiz ko'rsatardi — bu allaqachon yuz bergan (103% va 100%).
import {
  DAYS as OCCUPANCY_DAYS,
  DEFAULT_DAY_START,
  DEFAULT_DAY_END,
  toMinutes,
  toClock,
  overlaps,
  mergeIntervals,
  activeDaysOf,
} from "../../../helpers/roomOccupancy.helper.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * XONA BANDLIGI — SOAT DARAJASIDA (talab 13, 14, 27)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA MAVJUD `utilization()` YETARLI EMAS ──
 * `branchMetrics.service.js` da bandlik bor, lekin u FILIAL darajasida:
 * "A filialida bandlik 42%". Bu raqam bilan hech narsa qilib bo'lmaydi.
 * Talab esa aniq savollarni beradi:
 *
 *   "204-xona bo'shmi?"           → XONA darajasi kerak
 *   "Qaysi soatlar bo'sh?"        → SOAT darajasi kerak
 *   "A2 guruhni qayerga ko'chiray?" → BO'SH OYNA kerak
 *
 * Shuning uchan bu servis qo'shildi. U TAHLIL DVIGATELINI QAYTA
 * QURMAYDI: moliya, churn, P&L, AI signallari — hammasi joyida.
 * Bu faqat mavjud ma'lumotning (xonalar + guruh jadvali) o'qilmagan
 * kesimi.
 *
 * ── MANBA: FAQAT HAQIQIY MA'LUMOT ──
 *   Room               — xonalar (filial ko'lami bo'yicha)
 *   Group.roomId       — guruh qaysi xonada
 *   GroupScheduleItem  — kun + boshlanish/tugash vaqti
 *
 * Boshqa hech narsa. Bashorat yo'q, model yo'q, "o'rtacha markaz"
 * kabi o'ylab topilgan qiyoslar yo'q.
 *
 * ── ISH VAQTI — OSHKORA PARAMETR ──
 * "Bandlik" maxrajga bog'liq: 12 soatlik kun bo'yicha 50% bandlik,
 * 8 soatlik kun bo'yicha 75% bo'ladi. Ilgari bu `WORKING_HOURS_PER_DAY`
 * degan yashirin konstanta edi va hisobot uni aytmasdi.
 *
 * Endi u so'rov parametri (`dayStart`/`dayEnd`) va javobda QAYTADAN
 * ko'rsatiladi (`window`), ya'ni ekran "nimaga nisbatan" ekanini aytа
 * oladi.
 */

export const DAYS = OCCUPANCY_DAYS;

const round1 = (n) => Math.round(n * 10) / 10;
const percent = (part, whole) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

/** Band oraliqlardan ish vaqti ichidagi BO'SH oynalarni chiqaradi. */
const freeWindows = (slots, dayStartMin, dayEndMin, minMinutes) => {
  const sorted = [...slots].sort((x, y) => x.start - y.start);
  const out = [];
  let cursor = dayStartMin;

  for (const slot of sorted) {
    const start = Math.max(slot.start, dayStartMin);
    if (start - cursor >= minMinutes) {
      out.push({ from: toClock(cursor), to: toClock(start), minutes: start - cursor });
    }
    cursor = Math.max(cursor, Math.min(slot.end, dayEndMin));
  }
  if (dayEndMin - cursor >= minMinutes) {
    out.push({ from: toClock(cursor), to: toClock(dayEndMin), minutes: dayEndMin - cursor });
  }
  return out;
};

/**
 * @param {object} params
 * @param {string} [params.branchId] — bitta filial (Super Admin filial ichida)
 * @param {number} [params.dayStart] — ish kuni boshlanishi (soat)
 * @param {number} [params.dayEnd]   — ish kuni tugashi (soat)
 */
export const getRoomUtilization = async ({
  branchId,
  dayStart = DEFAULT_DAY_START,
  dayEnd = DEFAULT_DAY_END,
} = {}) => {
  if (!(dayEnd > dayStart)) {
    throw new ApiError(400, "Ish kuni tugashi boshlanishidan keyin bo'lishi kerak");
  }

  // KO'LAM: `branchFilter()` — asosiy chegara (fail-closed). So'ralgan
  // filial esa uni faqat TORAYTIRA oladi va bunda ham ruxsat alohida
  // tekshiriladi — aks holda parametr ko'lamdan chiqish yo'li bo'lardi.
  const scope = branchFilter();
  if (branchId) {
    if (!isBranchAllowed(branchId)) {
      throw new ApiError(403, "Bu filial ma'lumotini ko'rish huquqingiz yo'q");
    }
    scope.branchId = String(branchId);
  }

  const [rooms, groups] = await Promise.all([
    prisma.room.findMany({
      where: { ...scope, isActive: true, isDeleted: false },
      select: {
        id: true,
        name: true,
        capacity: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    }),
    // ⚠ `schedule` MAJBURIY `include`: u alohida jadval
    // (`GroupScheduleItem`). So'ralmasa `undefined` bo'lib qoladi va
    // bandlik JIMGINA 0 chiqadi.
    prisma.group.findMany({
      where: { ...scope, isActive: true, isDeleted: false },
      select: {
        id: true,
        name: true,
        roomId: true,
        branchId: true,
        schedule: { select: { day: true, startTime: true, endTime: true } },
      },
    }),
  ]);

  const dayStartMin = dayStart * 60;
  const dayEndMin = dayEnd * 60;
  const dayMinutes = dayEndMin - dayStartMin;

  // ══════════════════════════════════════════════════════════════════
  // FAOL KUNLAR — BANDLIK MAXRAJI (talab 14)
  // ══════════════════════════════════════════════════════════════════
  //
  // ── NEGA HAFTANING 7 KUNI EMAS ──
  // Ko'pchilik markaz yakshanba ishlamaydi. Sig'imni 7 kunga hisoblasak,
  // dushanbadan jumagacha TO'LA band xona 71% ko'rsatadi — ya'ni tizim
  // "joy bor" deydi, aslida esa bitta ham bo'sh soat yo'q. Bu eng yomon
  // xato turi: raqam ishonchli ko'rinadi va noto'g'ri qaror chiqaradi.
  //
  // Faol kun — jadvalda kamida bitta dars bo'lgan kun. Ya'ni markaz
  // qaysi kunlarda ishlashini AYTMAYDI, tizim uni jadvaldan O'QIYDI.
  // Hech qanday dars bo'lmasa — 7 kun (nolga bo'lishdan saqlaydi va
  // bu holatda band vaqt baribir 0).
  const activeDays = activeDaysOf(groups);
  const denominatorDays = activeDays.length || DAYS.length;

  // ── 1) GURUH JADVALINI XONA BO'YICHA TAQSIMLASH ──
  const byRoom = new Map(rooms.map((r) => [String(r.id), []]));
  const unassigned = [];
  // Talab bo'yicha guruhga xona biriktirilmagan bo'lsa — bu AYTILADI.
  // "Bandlik 40%" degan raqam ostida yashirilgan bo'lsa, hech kim
  // sababini topa olmasdi.

  for (const g of groups) {
    const slots = (g.schedule || [])
      .map((s) => ({
        day: s.day,
        start: toMinutes(s.startTime),
        end: toMinutes(s.endTime),
        startTime: s.startTime,
        endTime: s.endTime,
      }))
      .filter((s) => s.start !== null && s.end !== null && s.end > s.start);

    if (!g.roomId) {
      unassigned.push({
        groupId: String(g.id),
        name: g.name,
        branchId: String(g.branchId),
        lessonsPerWeek: slots.length,
      });
      continue;
    }

    const key = String(g.roomId);
    // Xona ro'yxatda yo'q bo'lishi mumkin (nofaol yoki boshqa ko'lam) —
    // unda bu guruh hisobga olinmaydi.
    if (!byRoom.has(key)) continue;
    for (const s of slots) {
      byRoom.get(key).push({ ...s, groupId: String(g.id), groupName: g.name });
    }
  }

  // ── 2) HAR XONA ──
  const roomRows = rooms.map((room) => {
    const slots = byRoom.get(String(room.id)) || [];

    const perDay = {};
    const free = {};
    const conflicts = [];
    let busyMinutes = 0;

    for (const day of DAYS) {
      const daySlots = slots
        .filter((s) => s.day === day)
        .sort((a, b) => a.start - b.start);

      perDay[day] = daySlots.map((s) => ({
        groupId: s.groupId,
        groupName: s.groupName,
        from: s.startTime,
        to: s.endTime,
        minutes: s.end - s.start,
      }));

      // Ish vaqti ichidagi qismi hisoblanadi: 08:00–10:00 dars 09:00 dan
      // boshlanadigan kunda bir soat sifatida sanaladi, aks holda
      // bandlik 100% dan oshib ketardi.
      //
      // Oraliqlar avval BIRLASHTIRILADI — ustma-ust yozilgan ikki dars
      // xonani ikki barobar band qilmaydi (qarang `mergeIntervals`).
      const clipped = daySlots
        .map((s) => ({
          start: Math.max(s.start, dayStartMin),
          end: Math.min(s.end, dayEndMin),
        }))
        .filter((s) => s.end > s.start);
      for (const s of mergeIntervals(clipped)) busyMinutes += s.end - s.start;

      free[day] = freeWindows(daySlots, dayStartMin, dayEndMin, 60);

      // TO'QNASHUV: bitta xona, bitta kun, kesishuvchi vaqt.
      for (let i = 0; i < daySlots.length; i += 1) {
        for (let j = i + 1; j < daySlots.length; j += 1) {
          if (overlaps(daySlots[i], daySlots[j])) {
            conflicts.push({
              day,
              a: {
                groupId: daySlots[i].groupId,
                name: daySlots[i].groupName,
                from: daySlots[i].startTime,
                to: daySlots[i].endTime,
              },
              b: {
                groupId: daySlots[j].groupId,
                name: daySlots[j].groupName,
                from: daySlots[j].startTime,
                to: daySlots[j].endTime,
              },
            });
          }
        }
      }
    }

    const capacityMinutes = dayMinutes * denominatorDays;

    return {
      roomId: String(room.id),
      name: room.name,
      capacity: room.capacity,
      branchId: String(room.branchId),
      branchName: room.branch?.name || "",
      groupCount: new Set(slots.map((s) => s.groupId)).size,
      lessonsPerWeek: slots.length,
      busyHours: round1(busyMinutes / 60),
      capacityHours: round1(capacityMinutes / 60),
      utilizationPercent: percent(busyMinutes, capacityMinutes),
      byDay: perDay,
      freeWindows: free,
      conflicts,
    };
  });

  // ── 3) TALAB EGRI CHIZIG'I: qaysi kun/soat band ──
  //
  // "Dushanba 18:00 eng band" degan javob shu yerdan chiqadi. Har soat
  // uchun o'sha soatda dars o'tayotgan XONALAR soni sanaladi.
  const demand = {};
  for (const day of DAYS) {
    demand[day] = [];
    for (let hour = dayStart; hour < dayEnd; hour += 1) {
      const bucket = { start: hour * 60, end: (hour + 1) * 60 };
      let busyRooms = 0;
      for (const room of roomRows) {
        const hit = (room.byDay[day] || []).some((s) =>
          overlaps({ start: toMinutes(s.from), end: toMinutes(s.to) }, bucket),
        );
        if (hit) busyRooms += 1;
      }
      demand[day].push({
        hour,
        label: `${String(hour).padStart(2, "0")}:00`,
        busyRooms,
        freeRooms: roomRows.length - busyRooms,
        loadPercent: percent(busyRooms, roomRows.length),
      });
    }
  }

  const totalBusy = roomRows.reduce((acc, r) => acc + r.busyHours, 0);
  const totalCapacity = roomRows.reduce((acc, r) => acc + r.capacityHours, 0);

  return {
    window: {
      dayStart,
      dayEnd,
      days: DAYS,
      // FAOL KUNLAR — javobda OCHIQ ko'rsatiladi, chunki bandlik
      // foizining ma'nosi aynan shunga bog'liq.
      activeDays,
      denominatorDays,
      // Ekran "nimaga nisbatan" ekanini AYTISHI uchun.
      note: `Bandlik ${String(dayStart).padStart(2, "0")}:00–${String(dayEnd).padStart(2, "0")}:00 oralig'i va haftaning ${denominatorDays} faol kuniga nisbatan hisoblangan`,
    },
    totals: {
      roomCount: roomRows.length,
      busyHours: round1(totalBusy),
      capacityHours: round1(totalCapacity),
      utilizationPercent: percent(totalBusy, totalCapacity),
      unassignedGroupCount: unassigned.length,
      conflictCount: roomRows.reduce((acc, r) => acc + r.conflicts.length, 0),
    },
    rooms: roomRows,
    demand,
    unassignedGroups: unassigned,
    recommendations: buildRecommendations(roomRows, demand, unassigned),
  };
};

/**
 * ══════════════════════════════════════════════════════════════════════
 * TAVSIYALAR — DETERMINISTIK QOIDALAR, MODEL EMAS
 * ══════════════════════════════════════════════════════════════════════
 *
 * Har tavsiya BIR qoidadan chiqadi va qoida javobda ko'rsatiladi
 * (`kind` + `evidence`). Ekran "tizim shunday deydi" demaydi — u
 * DALILNI ko'rsatadi va foydalanuvchi o'zi qaror qiladi.
 *
 * Chegaralar ataylab STATIK va yaxlit: "bandlik 30% dan past" — buni
 * markaz egasi o'qib tushunadi va kerak bo'lsa bahslashadi. Dinamik
 * chegara (masalan o'rtachadan ikki standart og'ish) bir xil ekranni
 * har hafta boshqacha ko'rsatardi va hech kim sababini bilmasdi.
 */
const LOW_UTILIZATION = 25;
const HIGH_UTILIZATION = 75;

/**
 * CHO'QQI — MUTLAQ FOIZ EMAS, MARKAZNING O'Z MAKSIMUMI.
 *
 * Avval bu "band xonalar 80% dan ko'p" edi va u kichik markazda HECH
 * QACHON ishlamasdi: uch xonali markazda 2/3 = 66.7%, ya'ni chegara
 * oshmasdi; 3/3 bo'lsa esa bo'sh xona qolmasdi. Qoida faqat beshdan
 * ortiq xonasi bor markazda ishlagan bo'lardi va buni hech narsa
 * ko'rsatmasdi.
 *
 * Endi cho'qqi — o'sha markazning eng band soati. Shart ikkita:
 * kamida IKKI xona band bo'lsin (bitta band xona "cho'qqi" emas) va
 * o'sha paytda kamida bitta xona bo'sh tursin — aks holda tavsiya
 * qilinadigan narsa yo'q.
 */
const MIN_PEAK_ROOMS = 2;

const buildRecommendations = (rooms, demand, unassigned) => {
  const out = [];

  /**
   * BARQAROR VA NOYOB ID.
   *
   * ── NEGA KERAK ──
   * Bitta xonada bir nechta to'qnashuv bo'lishi mumkin, cho'qqi soati
   * ham bir nechta bo'ladi. `kind + roomId` bilan ular BIR XIL kalit
   * olardi va ekran ularni bitta element deb hisoblardi (React
   * "two children with the same key" — brauzer testi shuni ushladi:
   * ro'yxatning bir qismi umuman chizilmasligi mumkin edi).
   *
   * ID SERVERDA yasaladi: ro'yxat indeksiga tayanish qayta
   * saralashdan keyin buzilardi.
   */
  const push = (rec, ...parts) =>
    out.push({ ...rec, id: [rec.kind, ...parts].filter(Boolean).join(":") });

  // 1) TO'QNASHUV — eng qattiq muammo, birinchi o'rinda. Bu tavsiya
  //    emas, XATO: ikki guruh bitta xonada bir vaqtda tura olmaydi.
  for (const room of rooms) {
    for (const c of room.conflicts) {
      push({
        kind: "conflict",
        severity: "high",
        roomId: room.roomId,
        roomName: room.name,
        day: c.day,
        text: `${room.name}: "${c.a.name}" va "${c.b.name}" bir vaqtda (${c.a.from}–${c.a.to} / ${c.b.from}–${c.b.to})`,
        evidence: { a: c.a, b: c.b },
      }, room.roomId, c.day, c.a.groupId, c.b.groupId, c.a.from);
    }
  }

  // 2) XONASIZ GURUH — jadval bor, xona yo'q. Bandlik hisobi bunday
  //    guruhni KO'RMAYDI, ya'ni raqam ham noto'g'ri bo'ladi.
  for (const g of unassigned) {
    push({
      kind: "unassigned_group",
      severity: g.lessonsPerWeek > 0 ? "high" : "low",
      groupId: g.groupId,
      text: `"${g.name}" guruhiga xona biriktirilmagan${g.lessonsPerWeek ? ` (haftasiga ${g.lessonsPerWeek} dars)` : ""}`,
      evidence: { lessonsPerWeek: g.lessonsPerWeek },
    }, g.groupId);
  }

  // 3) TO'LIB KETGAN VA BO'SH XONALAR.
  for (const room of rooms) {
    if (room.utilizationPercent === null) continue;
    if (room.utilizationPercent >= HIGH_UTILIZATION) {
      push({
        kind: "overloaded",
        severity: "medium",
        roomId: room.roomId,
        roomName: room.name,
        text: `${room.name} to'lib ketgan — bandlik ${room.utilizationPercent}%`,
        evidence: { utilizationPercent: room.utilizationPercent, busyHours: room.busyHours },
      }, room.roomId);
    } else if (room.utilizationPercent <= LOW_UTILIZATION && rooms.length > 1) {
      push({
        kind: "low_utilization",
        severity: "low",
        roomId: room.roomId,
        roomName: room.name,
        text: `${room.name} ko'p vaqt bo'sh — bandlik ${room.utilizationPercent}%`,
        evidence: { utilizationPercent: room.utilizationPercent, busyHours: room.busyHours },
      }, room.roomId);
    }
  }

  // 4) ENG BAND SOAT + O'SHA PAYTDA BO'SH XONA.
  //
  // "A2 guruhni 103-xonaga ko'chiring" degan tavsiyaning ASOSI shu:
  // aynan shu kun va soatda xonalarning ko'pi band, lekin filan xona
  // bo'sh turibdi. Bu taxmin emas — jadvaldan o'qilgan fakt.
  const peak = Math.max(
    0,
    ...Object.values(demand).flatMap((hours) => hours.map((h) => h.busyRooms)),
  );

  for (const [day, hours] of Object.entries(demand)) {
    for (const h of hours) {
      if (peak < MIN_PEAK_ROOMS || h.busyRooms < peak) continue;
      if (h.freeRooms <= 0) continue;

      const bucket = { start: h.hour * 60, end: (h.hour + 1) * 60 };
      const freeRoom = rooms.find(
        (r) =>
          !(r.byDay[day] || []).some((s) =>
            overlaps({ start: toMinutes(s.from), end: toMinutes(s.to) }, bucket),
          ),
      );
      if (!freeRoom) continue;

      push({
        kind: "free_slot_at_peak",
        severity: "low",
        roomId: freeRoom.roomId,
        roomName: freeRoom.name,
        day,
        text: `${day} ${h.label} — haftaning eng band soati (${h.busyRooms} xona band), lekin ${freeRoom.name} bo'sh`,
        evidence: {
          day,
          hour: h.hour,
          busyRooms: h.busyRooms,
          freeRooms: h.freeRooms,
          loadPercent: h.loadPercent,
        },
      }, freeRoom.roomId, day, String(h.hour));
    }
  }

  return out;
};

export default getRoomUtilization;
