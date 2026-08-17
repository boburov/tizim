# TOPSHIRIQ: MongoDB → PostgreSQL (Prisma) ko'chirishini TUGATISH

Sen `lc-total` monorepo'sining `server/` qismida ishlaysan.
Ish katalogi: `/Users/shukrullo/Desktop/lc-total/server`

---

## 1. VAZIYAT

Bu o'quv markazi boshqaruv tizimi. Baza **MongoDB'dan PostgreSQL'ga**
ko'chirilmoqda. Mongo ulanishi **butunlay olib tashlangan** — `mongoose.connect`
hech qayerda chaqirilmaydi.

**Hozirgi holat: 60 endpointdan 58 tasi (97%) ko'chirilgan.**

Poydevor TAYYOR, sen uni o'zgartirmaysan:

- `prisma/schema.prisma` — **78 model**, barcha 74 Mongoose modelini qoplaydi.
  **Yangi jadval yoki ustun qo'shish KERAK EMAS.** Ish faqat kod tarjimasi.
- Migratsiyalar bazaga qo'llangan (84 jadval, 77 enum, 35 qisman unique indeks,
  27 CHECK cheklovi).
- `src/config/prisma.js` — yagona PrismaClient nusxasi.
- Joblar Agenda'dan pg-boss'ga ko'chirilgan (`config/scheduler.js`).

### 501 SHARTNOMASI — buni tushunish SHART

`src/config/legacyMongoose.js` `bufferCommands: false` qo'yadi. Ko'chirilmagan
kod Mongoose'ga so'rov yuborsa **darhol** yiqiladi, `errorHandler` esa uni
**HTTP 501 `MODULE_NOT_MIGRATED`** ga aylantiradi.

Bu ATAYLAB shunday:

- Frontend 501 ni ko'rib "Manba ulanmagan" degan xotirjam holat ko'rsatadi
  (500 "server buzuq" EMAS).
- Modul ko'chgach 501 **o'z-o'zidan** yo'qoladi va ekran o'zi jonlanadi —
  klient kodiga bir qator ham tegilmaydi.

**Shuning uchun: haqiqiy 500 ni 501 ga AYLANTIRMA. 501 ni yashirish uchun
`try/catch` QO'SHMA.**

---

## 2. QOLGAN ISH — 31 fayl, 173 so'rov, 32 aggregate quvuri

### A) FOYDALANUVCHI KO'RADIGAN — 2 endpoint (eng yuqori ustuvorlik)

| Fayl | So'rov | Agg | Qator |
|---|---|---|---|
| `src/modules/notifications/services/notifications.service.js` | 28 | 2 | 838 |
| `src/modules/notifications/services/personalizeBody.helper.js` | 4 | 0 | 118 |
| `src/modules/assignments/services/assignments.service.js` | 27 | 1 | 660 |

Ikkalasi ham Telegram botga bog'langan (`BotUser`, `botStatus.helper.js`).
`notifications.service.js` **qisman ko'chirilgan** — inbox bo'lagi allaqachon
Prisma'da, fayl ikkala importni ham saqlaydi.

### B) AI QOLGAN QISMI — 12 fayl, 47 so'rov, 24 agg

Brifing zanjiri (`pulse`, `finance`, `health`, `insight`, `report`,
`insightWriter`, `recompute`) ALLAQACHON ko'chirilgan va `/admin/tahlil`
ishlayapti. Qolgani — **detektorlar**, ular insight YARATADI:

| Fayl | So'rov | Agg |
|---|---|---|
| `src/modules/ai/signals/student.signal.js` | 9 | 9 |
| `src/modules/ai/signals/teacher.signal.js` | 9 | 6 |
| `src/modules/ai/signals/lead.signal.js` | 8 | 3 |
| `src/modules/ai/signals/course.signal.js` | 4 | 3 |
| `src/modules/ai/signals/group.signal.js` | 2 | 2 |
| `src/modules/ai/services/lifecycle.service.js` | 7 | 1 |
| `src/modules/ai/services/ranking.service.js` | 4 | 1 |
| `src/modules/ai/services/studentInsight.service.js` | 4 | 1 |
| `src/modules/ai/services/narrationQueue.service.js` | 3 | 0 |
| `src/modules/ai/services/leadInsight.service.js` | 2 | 1 |
| `src/modules/ai/services/financeInsight.service.js` | 1 | 0 |
| `src/modules/ai/services/groupInsight.service.js` | 1 | 0 |
| `src/modules/ai/services/teacherInsight.service.js` | 1 | 1 |

### C) IMPORT REGISTRI — 5 fayl, 22 so'rov

`/imports/history` va `/imports/*/options` ISHLAYDI (handlerlar ko'chgan),
lekin **faylni haqiqatan yuklash hali ishlamaydi** — u shu fayllarga tushadi:

| Fayl | So'rov |
|---|---|
| `src/modules/imports/registry/userImportBase.js` | 6 |
| `src/modules/imports/registry/studentPayments.importer.js` | 4 |
| `src/modules/imports/registry/teacherSalaryPayments.importer.js` | 4 |
| `src/modules/imports/registry/students.importer.js` | 1 |
| `src/queues/importQueue.js` | 7 |

### D) FON JOBLARI — 6 fayl, 18 so'rov

**Bular hozir jadval bo'yicha ishga tushib YIQILADI** (log'da xato chiqadi):

| Fayl | So'rov |
|---|---|
| `src/jobs/aiMorningDigest.job.js` | 6 |
| `src/jobs/usageHeartbeat.job.js` | 5 |
| `src/jobs/lessonReminders.job.js` | 3 |
| `src/jobs/attendanceReminders.job.js` | 2 |
| `src/jobs/catchUpMonthly.js` | 1 |
| `src/jobs/lowAttendanceDigest.job.js` | 1 |

### E) TELEGRAM BOT — 4 fayl, 19 so'rov

| Fayl | So'rov |
|---|---|
| `src/bot/services/botUser.service.js` | 11 |
| `src/modules/botAuth/services/botAuth.service.js` | 4 |
| `src/bot/index.js` | 3 |
| `src/bot/services/notificationDeliver.service.js` | 1 |

### QAMRAB OLINMAYDIGAN: SEEDLAR

`src/seeds/` (25 fayl, 120 so'rov) **ATAYLAB Mongoose'da qoldiriladi** — ular
bir martalik skriptlar, ishlash yo'lida emas. **Ularga TEGMA.**

---

## 3. TARTIB

Bog'liqlik bo'yicha, yuqoridan pastga:

1. **`notifications`** — eng ko'p ishlatiladigan, boshqa modullar uni import
   qiladi (`attendance`, `feedback`, `leads` xabar yuboradi).
2. **`assignments`** — `storage` va botga bog'langan.
3. **AI detektorlari** — ular `insightWriter` (ko'chgan) ga tayanadi.
4. **Import registri** — `userImportBase` qolgan importerlarning poydevori,
   uni BIRINCHI qil.
5. **Joblar** — ular yuqoridagi servislarni chaqiradi, oxirida qil.
6. **Bot** — mustaqil, istalgan paytda.

---

## 4. KO'CHIRISH QOIDALARI

### 4.1 Asosiy moslik

```
Model.findById(id)        → prisma.m.findUnique({ where: { id } })
Model.findOne(q)          → prisma.m.findFirst({ where })
Model.find(q).lean()      → prisma.m.findMany({ where })
.select("a b")            → select: { a: true, b: true }
.select("-big")           → omit: { big: true }
.populate("x")            → include: { x: true }
.sort({ a: -1 })          → orderBy: { a: "desc" }
.skip(n).limit(m)         → skip: n, take: m
countDocuments            → count
$in / $nin                → in / notIn
$ne                       → not
$or / $and                → OR / AND
$regex                    → contains / startsWith + mode: "insensitive"
$inc: { n: 1 }            → data: { n: { increment: 1 } }
$addToSet + .length       → COUNT(DISTINCT ...) yoki distinct: ["col"]
.distinct("x", q)         → findMany({ where: q, select: {x:true}, distinct: ["x"] })
11000 (dublikat)          → P2002
```

### 4.2 ETTITA TUZOQ — hammasi shu loyihada HAQIQATAN yuz bergan

Bularning har biri **xato bermasdan** noto'g'ri natija bergan. Diqqat bilan o'qi.

**1. Mongo REF maydonlari `...Id` bo'ladi.**
```js
{ group: id }    // ❌ Prisma buni RELATION filtri deb o'qiydi
{ groupId: id }  // ✅
```
`student` → `studentId`, `user` → `userId`, `author` → `authorId`,
`teacher` → `teacherId`, `employee` → `employeeId`, `file` → `fileId`.
**Har birini `prisma/schema.prisma` dan tasdiqla, taxmin qilma.**

**ENG XAVFLI SHAKLI** — xarita kaliti qurishda:
```js
const key = `${String(a.group)}|${a.dateKey}`;   // ❌ "undefined|2026-08-17"
const key = `${String(a.groupId)}|${a.dateKey}`; // ✅
```
`attendance.service.js` da aynan shu bo'lgan: davomat yozuvlari bazada bor edi,
lekin hisobotda **butunlay yo'qolardi** — "jami 9 dars, kelgan 0, kelmagan 0".
Xato ham bermasdi.

**2. `select` `id` ni AVTOMATIK qaytarmaydi.**
Mongo `_id` ni doim qaytarardi. Prisma — yo'q. `select` yozsang va keyin
`row.id` yoki `_id` kerak bo'lsa, `id: true` ni **ochiq yoz**.

**3. Javobda `_id` QOLISHI SHART.**
Butun frontend shunga tayangan. `src/utils/serialize.js`:
```js
withLegacyId(doc)                                  // bitta yozuv
withLegacyIds(list)                                // ro'yxat
withPopulatedShape(r, { branch: "branchId" })      // eski populate shakli
```

**4. `isDeleted: { $ne: true }`**
- Modelda `isDeleted` ustuni BOR → `isDeleted: false`
- Ustun YO'Q → shartni **BUTUNLAY O'CHIR** (tarjima qilma).

**5. `not: null` faqat NULLABLE ustunda.**
Ustun NOT NULL bo'lsa Prisma RAD ETADI. Schema'ni tekshir.
`not` va oraliq BIR obyektda birga turadi:
```js
leftAt: { not: null, gte: from, lte: to }   // ✅
```

**6. Ikki ustunni solishtirish — Prisma `where` da MUMKIN EMAS.**
```js
$expr: { $gt: ["$expectedAmount", "$paidAmount"] }
```
→ `prisma.$queryRaw` bilan SQL. Prisma field reference (`prisma.m.fields.x`)
`not`/`gt` bilan **ishlamaydi** — bu bir marta `PrismaClientValidationError`
bergan va `/journal/reconcile` ni ikki hafta buzib turgan.

**7. Mongoose HUJJAT METODLARI yo'q.**
`doc.save()`, `doc.toJSON()`, `doc.softDelete()` — Prisma oddiy obyekt
qaytaradi. `save()` o'rniga `update({ where: { id }, data })`, `toJSON()`
o'rniga spread yoki `withLegacyId`.

### 4.3 FILIAL KO'LAMI — XAVFSIZLIK, EHTIYOT BO'L

`src/helpers/branchContext.helper.js` AsyncLocalStorage orqali ishlaydi:

```js
branchFilter("branchId")   // → Prisma `where` bo'lagi
branchGroupFilter("groupId")   // guruh orqali (async)
branchUserFilter("userId")     // foydalanuvchi orqali (async)
isBranchAllowed(id)
resolveBranchForWrite(user, requestedBranchId)
assertUserInBranchScope(userId)
```

**⚠ `branchMatchStage()` — MINA.** U Mongo quvurining `$match` bosqichi edi va
`...branchMatchStage()` ko'rinishida spread qilinardi. Endi u **Prisma shaklini**
qaytaradi, ya'ni quvurga qo'shilgan eski kod
*"Arguments must be aggregate pipeline operators"* bilan yiqiladi.

**Xom SQL'da `where` obyekti ISHLAMAYDI.** Har bir raw SQL ishlatadigan faylga
`rawBranchClause()` yoz. Tayyor namuna:
`src/modules/ai/signals/finance.signal.js` (boshidagi izoh bilan).

```js
const rawBranchClause = () => {
  const bf = branchFilter();
  if (!Object.keys(bf).length) return Prisma.empty;
  const v = bf.branchId;
  if (typeof v === "string") return Prisma.sql` AND "branchId" = ${v}`;
  if (v?.in) {
    if (!v.in.length) return Prisma.sql` AND FALSE`;   // FAIL-CLOSED
    return Prisma.sql` AND "branchId" IN (${Prisma.join(v.in)})`;
  }
  return Prisma.empty;
};
```

**FAIL-CLOSED MAJBURIY**: bo'sh ro'yxat `AND FALSE` berishi kerak. `Prisma.empty`
qaytarsang, hech qaysi filialga biriktirilmagan xodim **butun markazni** ko'radi.

Xuddi shunday `userBranchCondition()` ham Prisma shaklini qaytaradi —
`{ $and: [base, cond] }` EMAS, `{ AND: [base, cond] }` yoz. Aks holda Prisma
noma'lum kalitni **jimgina e'tiborsiz qoldiradi** va filtr umuman qo'llanmaydi.

### 4.4 AGGREGATE → nima bilan almashtirish

| Mongo | Prisma |
|---|---|
| `$group` bitta ustun bo'yicha | `groupBy({ by: ["col"] })` |
| `$group: { _id: null, sum }` | `aggregate({ _sum, _count })` |
| `$group` sana QISMLARI (`$year`/`$month`) | `$queryRaw` + `EXTRACT` |
| `$cond` bilan shartli yig'indi | SQL `FILTER (WHERE ...)` |
| `$addToSet` + `.length` | `COUNT(DISTINCT ...)` |
| `$lookup` | ikkinchi so'rov (`groupBy` `include` qabul qilmaydi) |
| `$expr` (ikki ustun) | `$queryRaw` |

**`groupBy` natijasining SHAKLI BOSHQA:**
```js
// Mongo:  { _id: { severity, stance }, count, impact }
// Prisma: { severity, stance, _count: { _all }, _sum: { expectedImpactAmount } }
```
`r._id.severity` → `r.severity`, `r.count` → `r._count._all`.

**Postgres identifikatorlari REGISTRGA SEZGIR** — raw SQL'da har doim
qo'shtirnoq: `"branchId"`, `"paidAt"`, `"isDeleted"`.

**Xom SQL sonni SATR qaytarishi mumkin** (bigint) — `Number(v) || 0` bilan o'ra.

### 4.5 ATOMIKLIK — pul yo'lida MAJBURIY

- `findOneAndUpdate({ _id, status: FROM })` (compare-and-set)
  → `updateMany({ where: { id, status: FROM }, data })` + `count === 0` tekshiruvi.
  **Read-compute-write QILMA** — ikki so'rov orasida boshqa so'rov o'tadi.
- Ikki yozuvni bog'lash → `prisma.$transaction(async (tx) => {...})`.
  Mongo'da `startSession()` standalone o'rnatmada jimgina atomiklikni
  yo'qotardi; Postgres'da tranzaksiya HAR DOIM haqiqiy.
- Katta halqa uchun timeout oshir: `prisma.$transaction(fn, { timeout: 20000 })`.

### 4.6 QISMAN UNIQUE INDEKSLAR — `upsert` ISHLAMAYDI

Bazada 35 ta qisman indeks bor, masalan:
```
(groupId, studentId, dateKey, slot) WHERE isDeleted = false
```
Prisma `upsert` **to'liq** unique kalit talab qiladi. Qisman indeks uchun:

```js
const prev = await tx.m.findFirst({ where: {...} });
if (prev) {
  doc = await tx.m.update({ where: { id: prev.id }, data });
} else {
  try {
    doc = await tx.m.create({ data: {...} });
  } catch (err) {
    if (err?.code !== "P2002") throw err;   // Mongo'da bu 11000 edi
    const again = await tx.m.findFirst({ where: {...} });
    doc = again ? await tx.m.update({ where: { id: again.id }, data }) : null;
  }
}
```
Namuna: `src/modules/attendance/services/attendance.service.js` (`bulkRecord`).

**To'liq unique bo'lsa** (masalan `AiReport` da `(branchId, period, periodKey)`)
`upsert` to'g'ridan-to'g'ri ishlaydi.

### 4.7 ICHMA-ICH OBYEKTLAR TEKISLANGAN

Mongo'dagi ichma-ich obyektlar Prisma'da alohida ustun:
```
expectedImpact.amount   → expectedImpactAmount
expectedImpact.currency → expectedImpactCurrency
expectedImpact.label    → expectedImpactLabel
```
Chaqiruvchilar hamon obyekt uzatishi mumkin — yoyishni **BITTA** nuqtada qil
(namuna: `ai/services/insightWriter.service.js`).

`history`, `factors`, `sourceRefs`, `scope` kabi maydonlar `Json` ustuni.
`$push` → massivni o'qib, JS'da `push` qilib, butun massivni qayta yozish.

### 4.8 KONSTANTALARNI MODEL FAYLIDAN CHIQAR

Model fayllari (`src/models/`) ko'chirish tugagach O'CHIRILADI. Agar
ko'chirayotgan fayling `models/x.model.js` dan **konstanta** import qilsa
(enum ro'yxati, versiya raqami), uni `src/constants/` ga chiqar.

Allaqachon chiqarilganlar (namuna sifatida qara):
`constants/ai.js`, `constants/storage.js`, `constants/teacherAttendance.js`,
`constants/calendar.js` (`GROUP_DAYS`).

---

## 5. NAMUNA FAYLLAR — YOZISHDAN OLDIN O'QI

| Fayl | Nimani ko'rsatadi |
|---|---|
| `src/modules/rooms/services/rooms.service.js` | eng oddiy CRUD, uslub etaloni |
| `src/modules/branchAnalytics/services/branchSales.service.js` | JS'da yig'ish, null vs 0 |
| `src/modules/ai/signals/finance.signal.js` | `rawBranchClause`, raw SQL, `EXTRACT` |
| `src/modules/ai/signals/pulse.signal.js` | `FILTER (WHERE)`, `ARRAY_AGG(DISTINCT)` |
| `src/modules/grades/services/grades.service.js` | qisman unique + `$transaction` |
| `src/modules/attendance/services/attendance.service.js` | eng murakkabi (1519 qator) |
| `src/modules/financeReport/services/financeReport.service.js` | `rawBranchClause` asli |

---

## 6. TEKSHIRISH — `200 OK` HECH NIMA ISBOTLAMAYDI

### 6.1 Zond

```bash
npm run probe:migration                          # jadval
npm run probe:migration -- --json > /tmp/b.json  # holatni saqlash
npm run probe:migration -- --before /tmp/b.json  # ⬆ YANGI / ⬇ REGRESSIYA
```

`tests/migrationProbe.mjs` har modulni HAQIQATAN chaqiradi. Statik tahlilga
(`grep mongoose`) **ishonma** — u ikkala yo'nalishda ham adashadi:
import bor lekin chaqirilmaydi (→ 200), yoki import yo'q lekin boshqa fayl
orqali chaqiriladi (→ 501).

### 6.2 YOLG'ON IJOBIYDAN EHTIYOT BO'L

Endpoint ma'lumotga **yetmasdan erta qaytishi** mumkin va 200 beradi:

- `/search?q=a` — kod 2 belgidan qisqa so'rovni Mongoose'ga umuman yubormaydi
  → 200. `q=owner` bilan esa 501 edi.
- `grades/rating/leaderboard` — faol a'zolik bo'lmasa erta qaytadi.

**Shuning uchun har ko'chirilgan o'qish yo'lini HAQIQIY YOZUV bilan tekshir:**
fixture yarat → endpointni chaqir → natijani ko'z bilan solishtir → **fixture'ni
o'chir**. `attendance` da aynan shu usul jimgina yo'qolishni tutgan.

### 6.3 Regressiya to'plami — HAR BIR fayldan keyin

```bash
npm run test:branch-cross      # 16
npm run test:invariants        # 44
npm run test:users-prisma      # 49
npm run test:groups-chain      # 32
npm run test:salary-chain      # 31
npm run test:staff-payroll     # 47
npm run test:expenses-chain    # 35
npm run test:branch-analytics  # 17
```
**Jami 271 ta tekshiruv, hozir hammasi o'tadi. Bittasi yiqilsa — sen buzding.**

Eski `tests/*.test.js` fayllarining ko'pi hali Mongo asosida va **ishlamaydi** —
ularni "tuzatishga" urinma, e'tiborsiz qoldir.

### 6.4 Brauzer

Server `localhost:5000`, klient `localhost:5173`.
```bash
cd ../client && npm run test:browser && npm run test:browser-create
```
⚠ Ko'p filialli markazda login'dan keyin **majburiy "Filialni tanlang"** ekrani
chiqadi (`[data-branch-gate]`). Testlar uni o'zi o'tadi.

---

## 7. QAT'IY TAQIQLAR

1. **Biznes mantiqni O'ZGARTIRMA.** Ko'chirish paytida xato ko'rsang — tuzatma.
   Kodda `// [MAVJUD XATO]` izohi qoldir va hisobotingda ayt. Tuzatish
   ALOHIDA, aniq belgilangan commit bo'ladi.
2. **Xatoni yashirish uchun `try/catch` QO'SHMA.**
3. **Sun'iy/mock ma'lumot QAYTARMA.** Bo'sh natija → bo'sh massiv, `null` →
   `null` (0 EMAS). "Hisoblab bo'lmaydi" va "nol" boshqa-boshqa gap.
4. **Filial ko'lami tekshiruvlarini OLIB TASHLAMA.** Ular xavfsizlik chegarasi.
5. **CHECK cheklovlarini zaiflashtirma**, ularga qarshi yozma.
6. **Testni "o'tsin" deb o'zgartirma.**
7. **`prisma/schema.prisma` ni o'zgartirma** — hamma narsa allaqachon bor.
8. **`src/seeds/` ga tegma.**
9. **Faylni yarim ko'chirilgan holda qoldirma.** Yarim ko'chirilgan fayl 501 dan
   YOMONROQ: endpoint 200 qaytarib, ichida buzuq ma'lumot beradi. Boshlagan
   faylingni oxiriga yetkaz yoki umuman boshlama.
10. **Fayl to'liq ko'chgach `mongoose` va `models/*` importlarini O'CHIR.**
    O'lik eksportlarga ham e'tibor ber (`export { mongoose }`, `export { toId }`
    kabilar modulni yiqitadi).

---

## 8. HAR BIR FAYL UCHUN ISH TARTIBI

1. Faylni **to'liq** o'qi.
2. `prisma/schema.prisma` dan unda ishlatiladigan **har bir model** ta'rifini
   grep bilan topib o'qi. **Maydon nomlarini TAXMIN QILMA.**
3. Klient shu endpointdan nimani o'qishini tekshir
   (`cd ../client && grep -rn "..." src/`) — javob shakli o'zgarmasligi kerak.
4. Ko'chir.
5. `node --check <fayl>`.
6. Serverni kut (nodemon o'zi qayta yuklaydi), endpointni **haqiqiy ma'lumot
   bilan** chaqir.
7. Regressiya to'plamini ishga tushir.
8. `npm run probe:migration -- --before ...` bilan farqni ko'r.

---

## 9. IZOH USLUBI

Kodbazada izohlar **o'zbek tilida** va **"nega shunday"** ni tushuntiradi,
"nima qilinyapti" ni emas. Har qatorga izoh yozma — faqat nostandart qaror
qabul qilgan joyingga:

- nega raw SQL (Prisma nimani qila olmaydi),
- nega bu yerda atomiklik kerak,
- `null` va `0` orasidagi farq nimani anglatadi,
- qaysi tuzoqqa tushmaslik uchun shunday yozilgan.

Yomon: `// foydalanuvchini topamiz`
Yaxshi: `// `a.group` EMAS, `a.groupId`: Prisma qatorida `group` RELATION
(so'ralmasa `undefined`) va kalit hech qachon mos kelmasdi — davomat
yozuvlari jimgina yo'qolardi.`

---

## 10. TUGAGANDA

1. `npm run probe:migration` → **60/60** bo'lishi kerak.
2. 271 ta regressiya tekshiruvi o'tishi kerak.
3. Joblar log'da xatosiz ko'tarilishi kerak (serverni qayta ishga tushirib
   `AiRun`, `usageHeartbeat` loglarini tekshir).
4. `MIGRATION.md` dagi holat jadvalini yangila.
5. **Faqat shundan keyin** yakuniy tozalash:
   - `src/models/` (74 fayl) o'chiriladi,
   - `src/config/legacyMongoose.js` va `errorHandler` dagi 501 shoxi o'chiriladi,
   - `mongoose` `package.json` dan olib tashlanadi,
   - `npm run probe:migration` yana ishga tushiriladi (hech narsa buzilmaganini
     tasdiqlash uchun).

**Bu tozalashni ERTA qilma** — 501 shartnomasi ko'chirish davomida qolgan
modullarni xotirjam ko'rsatib turadigan yagona mexanizm.

---

## 11. HISOBOT

Har fayldan keyin qisqa yoz:

- qaysi fayl, nechta so'rov ko'chdi;
- qaysi aggregate raw SQL'ga o'tdi va **nega** (Prisma nimani qila olmadi);
- qaysi joyda shubha qoldi;
- `mongoose` importi o'chdimi;
- topilgan mavjud xatolar (tuzatilmagan, faqat belgilangan);
- probe natijasi (oldin → keyin).

**Halol bo'l:** tekshirilmagan narsani "ishlaydi" dema. Ma'lumot bo'lmagani
uchun sinay olmagan yo'lni ochiq ayt.
