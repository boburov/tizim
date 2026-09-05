import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { branchFilter, isBranchAllowed } from '../../common/als/branch-context.js';
import {
  DAYS as OCCUPANCY_DAYS,
  DEFAULT_DAY_START,
  DEFAULT_DAY_END,
  toMinutes,
  toClock,
  overlaps,
  mergeIntervals,
  activeDaysOf,
} from '../../common/helpers/room-occupancy.js';

/**
 * ══════════════════════════════════════════════════════════════════════
 * XONA BANDLIGI — SOAT DARAJASIDA
 * (`branchAnalytics/services/roomUtilization.service.js` EKVIVALENTI)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA FILIAL DARAJASIDAGI `utilization()` YETARLI EMAS ──
 * "A filialida bandlik 42%" degan raqam bilan hech narsa qilib
 * bo'lmaydi. Aniq savollar boshqacha:
 *   "204-xona bo'shmi?"             → XONA darajasi
 *   "Qaysi soatlar bo'sh?"          → SOAT darajasi
 *   "A2 guruhni qayerga ko'chiray?" → BO'SH OYNA
 *
 * ── MANBA: FAQAT HAQIQIY MA'LUMOT ──
 *   `Room` · `Group.roomId` · `GroupScheduleItem`
 * Bashorat yo'q, model yo'q, "o'rtacha markaz" kabi o'ylab topilgan
 * qiyoslar yo'q.
 *
 * ── ISH VAQTI — OSHKORA PARAMETR ──
 * "Bandlik" MAXRAJGA bog'liq: 12 soatlik kun bo'yicha 50% bandlik,
 * 8 soatlik kun bo'yicha 75% bo'ladi. Ilgari bu yashirin konstanta edi
 * va hisobot uni AYTMASDI. Endi u so'rov parametri (`dayStart`/
 * `dayEnd`) va javobda QAYTADAN ko'rsatiladi (`window`).
 *
 * ⚠ ASOSIY HISOB PRIMITIVLARI `common/helpers/room-occupancy.ts` DAN —
 * `financeAnalytics` ham O'SHA manbadan foydalanishi kerak, aks holda
 * ikki ekran bir xil xona uchun ikki xil foiz ko'rsatadi.
 * ══════════════════════════════════════════════════════════════════════
 */

export const DAYS = OCCUPANCY_DAYS;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * ⚠ Bo'linuvchi 0 bo'lsa `null` (0 EMAS): "bandlik 0%" bilan "xona
 * yo'q / hisoblab bo'lmaydi" bir xil ko'rinmasligi kerak.
 */
const percent = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

/** Band oraliqlardan ish vaqti ichidagi BO'SH oynalarni chiqaradi. */
const freeWindows = (
  slots: any[], dayStartMin: number, dayEndMin: number, minMinutes: number,
) => {
  const sorted = [...slots].sort((x, y) => x.start - y.start);
  const out: any[] = [];
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
 * ══════════════════════════════════════════════════════════════════════
 * TAVSIYA CHEGARALARI — ATAYLAB STATIK VA YAXLIT
 * ══════════════════════════════════════════════════════════════════════
 * "Bandlik 30% dan past" — buni markaz egasi o'qib tushunadi va kerak
 * bo'lsa bahslashadi. Dinamik chegara (masalan o'rtachadan ikki
 * standart og'ish) bir xil ekranni HAR HAFTA boshqacha ko'rsatardi va
 * hech kim sababini bilmasdi.
 */
const LOW_UTILIZATION = 25;
const HIGH_UTILIZATION = 75;

/**
 * ⚠ CHO'QQI — MUTLAQ FOIZ EMAS, MARKAZNING O'Z MAKSIMUMI.
 *
 * Avval bu "band xonalar 80% dan ko'p" edi va u kichik markazda HECH
 * QACHON ishlamasdi: uch xonali markazda 2/3 = 66.7% (chegara oshmaydi),
 * 3/3 bo'lsa esa bo'sh xona qolmaydi. Qoida faqat beshdan ortiq xonasi
 * bor markazda ishlagan bo'lardi va buni HECH NARSA ko'rsatmasdi.
 *
 * Endi cho'qqi — o'sha markazning ENG BAND soati. Shart ikkita: kamida
 * IKKI xona band bo'lsin va o'sha paytda kamida bitta xona BO'SH tursin.
 */
const MIN_PEAK_ROOMS = 2;

@Injectable()
export class RoomUtilizationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getRoomUtilization({
    branchId,
    dayStart = DEFAULT_DAY_START,
    dayEnd = DEFAULT_DAY_END,
  }: { branchId?: string; dayStart?: number; dayEnd?: number } = {}) {
    if (!(dayEnd > dayStart)) {
      throw new ApiError(400, "Ish kuni tugashi boshlanishidan keyin bo'lishi kerak");
    }

    // ⚠ KO'LAM: `branchFilter()` — ASOSIY chegara (fail-closed).
    // So'ralgan filial uni faqat TORAYTIRA oladi va bunda ham ruxsat
    // ALOHIDA tekshiriladi — aks holda parametr ko'lamdan chiqish yo'li
    // bo'lardi.
    const scope: Record<string, any> = branchFilter();
    if (branchId) {
      if (!isBranchAllowed(branchId)) {
        throw new ApiError(403, "Bu filial ma'lumotini ko'rish huquqingiz yo'q");
      }
      scope.branchId = String(branchId);
    }

    const [rooms, groups] = await Promise.all([
      this.prisma.room.findMany({
        where: { ...scope, isActive: true, isDeleted: false } as never,
        select: {
          id: true, name: true, capacity: true, branchId: true,
          branch: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
      }),
      // ⚠ `schedule` MAJBURIY: alohida jadval. So'ralmasa bandlik
      // JIMGINA 0 chiqadi.
      this.prisma.group.findMany({
        where: { ...scope, isActive: true, isDeleted: false } as never,
        select: {
          id: true, name: true, roomId: true, branchId: true,
          schedule: { select: { day: true, startTime: true, endTime: true } },
        },
      }),
    ]);

    const dayStartMin = dayStart * 60;
    const dayEndMin = dayEnd * 60;
    const dayMinutes = dayEndMin - dayStartMin;

    /**
     * ⚠ FAOL KUNLAR — BANDLIK MAXRAJI, HAFTANING 7 KUNI EMAS.
     *
     * Ko'pchilik markaz yakshanba ishlamaydi. Sig'imni 7 kunga
     * hisoblasak, dushanbadan jumagacha TO'LA band xona 71%
     * ko'rsatadi — tizim "joy bor" deydi, aslida bitta ham bo'sh soat
     * yo'q. Bu eng yomon xato turi: raqam ISHONCHLI ko'rinadi va
     * NOTO'G'RI qaror chiqaradi.
     *
     * Dars umuman bo'lmasa — 7 kun (nolga bo'lishdan saqlaydi va bu
     * holatda band vaqt baribir 0).
     */
    const activeDays = activeDaysOf(groups as never);
    const denominatorDays = activeDays.length || DAYS.length;

    // ── 1) GURUH JADVALINI XONA BO'YICHA TAQSIMLASH ──
    const byRoom = new Map<string, any[]>(rooms.map((r) => [String(r.id), []]));
    // ⚠ Xonasiz guruh AYTILADI: "bandlik 40%" ostida yashirilsa hech
    // kim sababini topa olmasdi.
    const unassigned: any[] = [];

    for (const g of groups as any[]) {
      const slots = (g.schedule || [])
        .map((s: any) => ({
          day: s.day,
          start: toMinutes(s.startTime),
          end: toMinutes(s.endTime),
          startTime: s.startTime,
          endTime: s.endTime,
        }))
        .filter((s: any) => s.start !== null && s.end !== null && s.end > s.start);

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
      // Xona ro'yxatda yo'q bo'lishi mumkin (nofaol yoki boshqa ko'lam).
      if (!byRoom.has(key)) continue;
      for (const s of slots) {
        byRoom.get(key)!.push({ ...s, groupId: String(g.id), groupName: g.name });
      }
    }

    // ── 2) HAR XONA ──
    const roomRows = rooms.map((room) => {
      const slots = byRoom.get(String(room.id)) || [];

      const perDay: Record<string, any[]> = {};
      const free: Record<string, any[]> = {};
      const conflicts: any[] = [];
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

        // ⚠ ISH VAQTI ICHIDAGI QISMI: 08:00–10:00 dars 09:00 dan
        // boshlanadigan kunda BIR SOAT sifatida sanaladi, aks holda
        // bandlik 100% dan oshib ketardi.
        //
        // ⚠ Oraliqlar avval BIRLASHTIRILADI — ustma-ust yozilgan ikki
        // dars xonani IKKI BAROBAR band qilmaydi.
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
                  groupId: daySlots[i].groupId, name: daySlots[i].groupName,
                  from: daySlots[i].startTime, to: daySlots[i].endTime,
                },
                b: {
                  groupId: daySlots[j].groupId, name: daySlots[j].groupName,
                  from: daySlots[j].startTime, to: daySlots[j].endTime,
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
        branchName: (room as any).branch?.name || '',
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
    // "Dushanba 18:00 eng band" degan javob shu yerdan chiqadi.
    const demand: Record<string, any[]> = {};
    for (const day of DAYS) {
      demand[day] = [];
      for (let hour = dayStart; hour < dayEnd; hour += 1) {
        const bucket = { start: hour * 60, end: (hour + 1) * 60 };
        let busyRooms = 0;
        for (const room of roomRows) {
          const hit = (room.byDay[day] || []).some((s: any) =>
            overlaps({ start: toMinutes(s.from)!, end: toMinutes(s.to)! }, bucket),
          );
          if (hit) busyRooms += 1;
        }
        demand[day].push({
          hour,
          label: `${String(hour).padStart(2, '0')}:00`,
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
        // ⚠ FAOL KUNLAR javobda OCHIQ ko'rsatiladi — bandlik foizining
        // ma'nosi aynan shunga bog'liq.
        activeDays,
        denominatorDays,
        note: `Bandlik ${String(dayStart).padStart(2, '0')}:00–${String(dayEnd).padStart(2, '0')}:00 oralig'i va haftaning ${denominatorDays} faol kuniga nisbatan hisoblangan`,
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
      recommendations: this.buildRecommendations(roomRows, demand, unassigned),
    };
  }

  /**
   * ══════════════════════════════════════════════════════════════════
   * TAVSIYALAR — DETERMINISTIK QOIDALAR, MODEL EMAS
   * ══════════════════════════════════════════════════════════════════
   * Har tavsiya BIR qoidadan chiqadi va qoida javobda ko'rsatiladi
   * (`kind` + `evidence`). Ekran "tizim shunday deydi" demaydi — u
   * DALILNI ko'rsatadi va foydalanuvchi o'zi qaror qiladi.
   */
  private buildRecommendations(rooms: any[], demand: Record<string, any[]>, unassigned: any[]) {
    const out: any[] = [];

    /**
     * ⚠ BARQAROR VA NOYOB ID.
     *
     * Bitta xonada bir nechta to'qnashuv bo'lishi mumkin, cho'qqi soati
     * ham bir nechta bo'ladi. `kind + roomId` bilan ular BIR XIL kalit
     * olardi va ekran ularni BITTA element deb hisoblardi (React "two
     * children with the same key" — ro'yxatning bir qismi umuman
     * chizilmasligi mumkin edi).
     *
     * ⚠ ID SERVERDA yasaladi: ro'yxat INDEKSIGA tayanish qayta
     * saralashdan keyin buzilardi.
     */
    const push = (rec: any, ...parts: any[]) =>
      out.push({ ...rec, id: [rec.kind, ...parts].filter(Boolean).join(':') });

    // 1) TO'QNASHUV — bu tavsiya emas, XATO: ikki guruh bitta xonada
    //    bir vaqtda tura olmaydi. Birinchi o'rinda.
    for (const room of rooms) {
      for (const c of room.conflicts) {
        push({
          kind: 'conflict',
          severity: 'high',
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
        kind: 'unassigned_group',
        severity: g.lessonsPerWeek > 0 ? 'high' : 'low',
        groupId: g.groupId,
        text: `"${g.name}" guruhiga xona biriktirilmagan${g.lessonsPerWeek ? ` (haftasiga ${g.lessonsPerWeek} dars)` : ''}`,
        evidence: { lessonsPerWeek: g.lessonsPerWeek },
      }, g.groupId);
    }

    // 3) TO'LIB KETGAN VA BO'SH XONALAR.
    for (const room of rooms) {
      if (room.utilizationPercent === null) continue;
      if (room.utilizationPercent >= HIGH_UTILIZATION) {
        push({
          kind: 'overloaded',
          severity: 'medium',
          roomId: room.roomId,
          roomName: room.name,
          text: `${room.name} to'lib ketgan — bandlik ${room.utilizationPercent}%`,
          evidence: { utilizationPercent: room.utilizationPercent, busyHours: room.busyHours },
        }, room.roomId);
      } else if (room.utilizationPercent <= LOW_UTILIZATION && rooms.length > 1) {
        push({
          kind: 'low_utilization',
          severity: 'low',
          roomId: room.roomId,
          roomName: room.name,
          text: `${room.name} ko'p vaqt bo'sh — bandlik ${room.utilizationPercent}%`,
          evidence: { utilizationPercent: room.utilizationPercent, busyHours: room.busyHours },
        }, room.roomId);
      }
    }

    // 4) ENG BAND SOAT + O'SHA PAYTDA BO'SH XONA.
    //
    // "A2 guruhni 103-xonaga ko'chiring" tavsiyasining ASOSI shu: aynan
    // shu kun va soatda xonalarning ko'pi band, lekin filan xona bo'sh
    // turibdi. Bu TAXMIN emas — jadvaldan o'qilgan FAKT.
    const peak = Math.max(
      0,
      ...Object.values(demand).flatMap((hours) => hours.map((h: any) => h.busyRooms)),
    );

    for (const [day, hours] of Object.entries(demand)) {
      for (const h of hours as any[]) {
        if (peak < MIN_PEAK_ROOMS || h.busyRooms < peak) continue;
        if (h.freeRooms <= 0) continue;

        const bucket = { start: h.hour * 60, end: (h.hour + 1) * 60 };
        const freeRoom = rooms.find(
          (r) =>
            !(r.byDay[day] || []).some((s: any) =>
              overlaps({ start: toMinutes(s.from)!, end: toMinutes(s.to)! }, bucket),
            ),
        );
        if (!freeRoom) continue;

        push({
          kind: 'free_slot_at_peak',
          severity: 'low',
          roomId: freeRoom.roomId,
          roomName: freeRoom.name,
          day,
          text: `${day} ${h.label} — haftaning eng band soati (${h.busyRooms} xona band), lekin ${freeRoom.name} bo'sh`,
          evidence: {
            day, hour: h.hour, busyRooms: h.busyRooms,
            freeRooms: h.freeRooms, loadPercent: h.loadPercent,
          },
        }, freeRoom.roomId, day, String(h.hour));
      }
    }

    return out;
  }

  private getDayKey(date: Date): string {
    const map = [6, 0, 1, 2, 3, 4, 5];
    return DAYS[map[date.getDay()]];
  }

  private formatDateKey(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  async getDashboard({
    branchId,
    from,
    to,
  }: {
    branchId?: string;
    from?: Date;
    to?: Date;
  } = {}) {
    const scope: Record<string, any> = branchFilter();
    if (branchId) {
      if (!isBranchAllowed(branchId)) {
        throw new ApiError(403, "Bu filial ma'lumotini ko'rish huquqingiz yo'q");
      }
      scope.branchId = String(branchId);
    }

    const today = new Date();
    const targetFrom = from || new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    const targetTo = to || today;
    
    const baseUtilization = await this.getRoomUtilization({ branchId });
    
    const [cancellations, groups] = await Promise.all([
      this.prisma.lessonCancellation.findMany({
        where: {
          group: { ...scope, isActive: true, isDeleted: false },
          isDeleted: false,
          dateKey: {
            gte: this.formatDateKey(targetFrom),
            lte: this.formatDateKey(targetTo),
          }
        },
        select: { groupId: true, dateKey: true }
      }),
      this.prisma.group.findMany({
        where: { ...scope, isActive: true, isDeleted: false },
        select: { id: true, roomId: true, schedule: { select: { day: true, startTime: true, endTime: true } } }
      })
    ]);

    const cancelSet = new Set(cancellations.map(c => `${c.groupId}_${c.dateKey}`));

    const curr = new Date(targetFrom);
    curr.setHours(0,0,0,0);
    const end = new Date(targetTo);
    end.setHours(0,0,0,0);
    
    let occupiedToday = 0;
    let emptyToday = 0;
    let todayLessons = 0;
    const todayKey = this.formatDateKey(today);

    const trend = [];

    while (curr <= end) {
      const dKey = this.formatDateKey(curr);
      const dayStr = this.getDayKey(curr);
      let dayLessons = 0;
      const dayOccupiedRooms = new Set();
      
      for (const g of groups) {
        if (!g.schedule) continue;
        const slotsForDay = (g.schedule as any[]).filter(s => s.day === dayStr);
        if (slotsForDay.length > 0 && !cancelSet.has(`${g.id}_${dKey}`)) {
          dayLessons += slotsForDay.length;
          if (g.roomId) dayOccupiedRooms.add(g.roomId);
        }
      }

      const isToday = dKey === todayKey;
      if (isToday) {
        todayLessons = dayLessons;
        occupiedToday = dayOccupiedRooms.size;
        emptyToday = baseUtilization.totals.roomCount - occupiedToday;
      }
      
      const occupancyRate = percent(dayOccupiedRooms.size, baseUtilization.totals.roomCount) || 0;
      
      trend.push({
        date: dKey,
        day: dayStr,
        occupancyRate,
        occupiedRooms: dayOccupiedRooms.size,
        lessons: dayLessons
      });
      
      curr.setDate(curr.getDate() + 1);
    }
    
    const sortedRooms = [...baseUtilization.rooms].sort((a,b) => (b.utilizationPercent || 0) - (a.utilizationPercent || 0));
    
    return {
      kpi: {
        totalRooms: baseUtilization.totals.roomCount,
        occupiedToday,
        emptyToday,
        todayLessons,
        averageOccupancy: baseUtilization.totals.utilizationPercent,
        busiestRoom: sortedRooms.length > 0 ? { name: sortedRooms[0].name, occupancy: sortedRooms[0].utilizationPercent } : null,
        leastOccupiedRoom: sortedRooms.length > 0 ? { name: sortedRooms[sortedRooms.length - 1].name, occupancy: sortedRooms[sortedRooms.length - 1].utilizationPercent } : null,
      },
      statusDistribution: [
        { status: 'Band', count: occupiedToday, color: 'bg-primary' },
        { status: "Bo'sh", count: emptyToday, color: 'bg-warning' },
        { status: 'Ta\'mirda', count: 0, color: 'bg-destructive' },
        { status: 'Nofaol', count: 0, color: 'bg-muted-foreground' },
      ],
      trend,
      ranking: sortedRooms.map(r => ({
        roomId: r.roomId,
        name: r.name,
        branchName: r.branchName,
        utilizationPercent: r.utilizationPercent,
        freeHours: r.capacityHours - r.busyHours,
        busyHours: r.busyHours,
        groupCount: r.groupCount
      })),
      baseUtilization
    };
  }

  async findEmptyRooms({
    branchId,
    days,
    startTime,
    endTime,
    capacity,
  }: {
    branchId?: string;
    days: string[];
    startTime?: string;
    endTime?: string;
    capacity?: number;
  }) {
    const scope: Record<string, any> = branchFilter();
    if (branchId) {
      if (!isBranchAllowed(branchId)) {
        throw new ApiError(403, "Bu filial ma'lumotini ko'rish huquqingiz yo'q");
      }
      scope.branchId = String(branchId);
    }
    
    // fetch rooms first so we can filter by capacity
    const roomsWhere: Record<string, any> = { ...scope, isActive: true, isDeleted: false };
    if (capacity) {
      roomsWhere.capacity = { gte: capacity };
    }
    const matchingRooms = await this.prisma.room.findMany({
      where: roomsWhere,
      select: { id: true, name: true, capacity: true, branch: { select: { name: true } } }
    });
    
    const matchingRoomIds = new Set(matchingRooms.map(r => String(r.id)));

    const baseUtilization = await this.getRoomUtilization({ branchId });
    const filteredBaseRooms = baseUtilization.rooms.filter(r => matchingRoomIds.has(String(r.roomId)));

    const startMin = startTime ? toMinutes(startTime) : null;
    const endMin = endTime ? toMinutes(endTime) : null;
    
    const results = [];
    
    for (const room of filteredBaseRooms) {
      // Bir nechta kun tanlangan bo'lsa, ularning barchasidagi band vaqtlarni birlashtiramiz.
      // Shunda faqat barcha kunlarda HAM bo'sh bo'lgan vaqtlargina "freeWindows" ga kiradi.
      let allSlots: any[] = [];
      let totalDaySlotsLength = 0;
      for (const day of days) {
        const slots = room.byDay[day] || [];
        totalDaySlotsLength += slots.length;
        allSlots = allSlots.concat(slots);
      }
      
      const merged = mergeIntervals(allSlots.map((s: any) => ({ start: toMinutes(s.from)!, end: toMinutes(s.to)! })));
      const newFree = freeWindows(merged, DEFAULT_DAY_START * 60, DEFAULT_DAY_END * 60, 0);
      
      let isFree = false;
      let status = "Bo'sh";
      
      if (startMin !== null && endMin !== null) {
        const requested = { start: startMin, end: endMin };
        const hasOverlap = merged.some(s => overlaps(s, requested));
        isFree = !hasOverlap;
        status = hasOverlap ? (merged.length > 1 ? "Qisman bo'sh" : "Band") : "Bo'sh";
      } else {
        isFree = newFree.length > 0;
        status = totalDaySlotsLength > 0 ? (newFree.length > 0 ? "Qisman bo'sh" : "Band") : "Bo'sh";
      }
      
      results.push({
        roomId: room.roomId,
        name: room.name,
        capacity: room.capacity,
        branchName: room.branchName,
        status,
        isFree,
        freeWindows: newFree,
      });
    }
    
    return results.sort((a,b) => (a.isFree === b.isFree ? a.name.localeCompare(b.name) : (a.isFree ? -1 : 1)));
  }

  async getSchedule({
    branchId,
    from,
    to,
    roomId,
  }: {
    branchId?: string;
    from?: Date;
    to?: Date;
    roomId?: string;
  }) {
    const scope: Record<string, any> = branchFilter();
    if (branchId) {
      if (!isBranchAllowed(branchId)) {
        throw new ApiError(403, "Bu filial ma'lumotini ko'rish huquqingiz yo'q");
      }
      scope.branchId = String(branchId);
    }
    
    const today = new Date();
    const targetFrom = from || today;
    const targetTo = to || new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000);

    const [rooms, groups, cancellations] = await Promise.all([
      this.prisma.room.findMany({
        where: { ...scope, isActive: true, isDeleted: false, ...(roomId ? { id: String(roomId) } : {}) },
        select: { id: true, name: true, branch: { select: { name: true } } },
        orderBy: { name: 'asc' }
      }),
      this.prisma.group.findMany({
        where: { ...scope, isActive: true, isDeleted: false },
        select: { 
          id: true, 
          name: true, 
          roomId: true, 
          schedule: { select: { day: true, startTime: true, endTime: true } },
          course: { select: { title: true } },
          teachers: { select: { firstName: true, lastName: true } }
        }
      }),
      this.prisma.lessonCancellation.findMany({
        where: {
          group: { ...scope, isActive: true, isDeleted: false },
          isDeleted: false,
          dateKey: {
            gte: this.formatDateKey(targetFrom),
            lte: this.formatDateKey(targetTo),
          }
        },
        select: { groupId: true, dateKey: true }
      }),
    ]);

    const cancelSet = new Set(cancellations.map(c => `${c.groupId}_${c.dateKey}`));

    const dates = [];
    const curr = new Date(targetFrom);
    curr.setHours(0,0,0,0);
    const end = new Date(targetTo);
    end.setHours(0,0,0,0);

    while (curr <= end) {
      const dKey = this.formatDateKey(curr);
      const dayStr = this.getDayKey(curr);
      dates.push({ date: dKey, day: dayStr });
      curr.setDate(curr.getDate() + 1);
    }

    const schedule = [];
    for (const d of dates) {
      const daySchedule = { date: d.date, day: d.day, rooms: [] };
      for (const room of rooms) {
        const roomLessons = [];
        for (const g of groups) {
          if (g.roomId !== room.id) continue;
          if (!g.schedule) continue;
          const slots = (g.schedule as any[]).filter(s => s.day === d.day);
          for (const slot of slots) {
            const isCanceled = cancelSet.has(`${g.id}_${d.date}`);
            roomLessons.push({
              groupId: g.id,
              groupName: g.name,
              subjectName: (g as any).course?.title || '',
              teacherName: (g as any).teachers?.[0] ? `${(g as any).teachers[0].firstName} ${(g as any).teachers[0].lastName}` : '',
              startTime: slot.startTime,
              endTime: slot.endTime,
              isCanceled
            });
          }
        }
        roomLessons.sort((a,b) => (toMinutes(a.startTime) || 0) - (toMinutes(b.startTime) || 0));
        (daySchedule.rooms as any[]).push({
          roomId: room.id,
          roomName: room.name,
          branchName: room.branch?.name || '',
          lessons: roomLessons
        });
      }
      schedule.push(daySchedule);
    }

    return schedule;
  }

  async getRoomDetails({
    branchId,
    roomId,
    from,
    to,
  }: {
    branchId?: string;
    roomId: string;
    from?: Date;
    to?: Date;
  }) {
    const scope: Record<string, any> = branchFilter();
    if (branchId) {
      if (!isBranchAllowed(branchId)) {
        throw new ApiError(403, "Bu filial ma'lumotini ko'rish huquqingiz yo'q");
      }
      scope.branchId = String(branchId);
    }

    const room = await this.prisma.room.findFirst({
      where: { ...scope, id: roomId, isDeleted: false },
    });
    if (!room) {
      throw new ApiError(404, "Xona topilmadi");
    }

    const baseUtilization = await this.getRoomUtilization({ branchId });
    const roomStats = baseUtilization.rooms.find(r => String(r.roomId) === roomId);

    const today = new Date();
    const targetFrom = from || new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    const targetTo = to || today;

    const groups = await this.prisma.group.findMany({
      where: { ...scope, roomId, isActive: true, isDeleted: false },
      select: { 
        id: true, 
        name: true,
        memberships: { select: { studentId: true } },
        teachers: { select: { id: true } }
      }
    });

    const studentIds = new Set();
    const teacherIds = new Set();
    
    for (const g of groups) {
      for (const m of g.memberships) studentIds.add(m.studentId);
      for (const t of g.teachers) teacherIds.add(t.id);
    }

    const fullSchedule = await this.getSchedule({ branchId, from: targetFrom, to: targetTo, roomId });
    const lessons = [];
    for (const day of fullSchedule) {
      const roomDay = (day.rooms as any[]).find(r => r.roomId === roomId);
      if (roomDay && roomDay.lessons) {
         for (const l of roomDay.lessons) {
           lessons.push({ ...l, date: day.date, day: day.day });
         }
      }
    }
    
    const dayStr = this.getDayKey(today);
    const dKey = this.formatDateKey(today);
    const cancellations = await this.prisma.lessonCancellation.findMany({
      where: {
        group: { roomId },
        isDeleted: false,
        dateKey: dKey
      },
      select: { groupId: true }
    });
    const cancelSet = new Set(cancellations.map(c => String(c.groupId)));
    
    const daySlots = (roomStats?.byDay[dayStr] || []).filter((s: any) => !cancelSet.has(s.groupId));
    const merged = mergeIntervals(daySlots.map((s: any) => ({ start: toMinutes(s.from)!, end: toMinutes(s.to)! })));
    const free = freeWindows(merged, DEFAULT_DAY_START * 60, DEFAULT_DAY_END * 60, 0);

    return {
      roomId: room.id,
      name: room.name,
      capacity: room.capacity,
      areaM2: room.areaM2,
      equipment: room.equipment,
      note: room.note,
      stats: roomStats ? {
        utilizationPercent: roomStats.utilizationPercent,
        groupCount: roomStats.groupCount,
        lessonsPerWeek: roomStats.lessonsPerWeek,
        busyHours: roomStats.busyHours,
        freeHours: roomStats.capacityHours - roomStats.busyHours,
        capacityHours: roomStats.capacityHours,
      } : null,
      studentsCount: studentIds.size,
      teachersCount: teacherIds.size,
      freeToday: free,
      lessons: lessons.sort((a,b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
    };
  }
}
