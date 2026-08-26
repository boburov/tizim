# Moliya moduli — arxitektura hisoboti

> **Holat (2026-08-26 da qayta o'lchandi): §6 rejasi BAJARILDI.**
> Sarlavhadagi eski "implementatsiya boshlanmagan" yozuvi ESKIRGAN edi.
> Schemada `RecurringExpense`, `Budget`/`BudgetLine`, `Refund`,
> `FinancialAuditLog` bor; `JournalEntry` o'lchov ustunlari
> (`studentId`/`teacherId`/`groupId`/`courseId`…) va yangi `EntryKind`
> qiymatlari (`refund`, `owner_investment`, `owner_withdrawal`,
> `payment_fee`, `account_transfer`) qo'shilgan;
> `src/modules/finance/financial-transaction.service.ts` — yagona yozuv
> nuqtasi; `/finance-analytics` da 30 marshrut (summary, cash-flow,
> receivables, budget, teachers/directions/groups/rooms foydasi, alerts,
> intelligence).
>
> **Nega saqlanadi:** §3 dagi bo'shliq jadvali endi tarixiy, LEKIN §4
> (nega parallel jadval EMAS, jurnal kengaytiriladi), §7 (regressiya
> ro'yxati) va oxiridagi ruxsat xaritasi (`finance.view_*` ATAYLAB
> `finance.read` ga kirmasligi) HAMON AMALDA. Bu qarorlar boshqa hech
> qayerda yozilmagan.
>
> ⚠ §3 dagi "❌ / 🟡" belgilarini bugungi holat deb O'QIMANG — ular
> auditning boshlanish nuqtasi.

---

## 1. Mavjud moliyaviy arxitektura (qisqacha)

Tizimda **allaqachon qo'sh yozuvli (double-entry) jurnal bor.** Bu eng muhim
topilma: talab qilingan "financial transaction architecture" noldan
qurilmasligi kerak — u mavjud va ishlaydi.

```
                      ┌─────────────────────────────┐
   OPERATSION QATLAM  │  JurnaL QATLAMI (haqiqat)   │
   (nima hisoblandi)  │  (pul qayerda)              │
                      └─────────────────────────────┘

  StudentPayment ──┐
  (expected/paid)  │
  PaymentTransaction ──► journalPosting.postPayment ──┐
  DepositTransaction ──► postDepositTopup/Withdraw/Apply ──┤
  Expense ─────────────► postExpense ─────────────────┤──► journal.post()
  SalaryTransaction ───► postSalary ──────────────────┤     ├─ JournalEntry
  StaffSalaryTransaction ► postSalary ────────────────┤     └─ JournalLine[] ──► Account
  CashTransfer ────────► transfer_send/receive ───────┤          (branch, kind)
  Shift (kamomad) ─────► shift_close ─────────────────┘
```

**Invariantlar allaqachon himoyalangan** (`journal.service.js`):
- debet = kredit, aks holda yozuv rad etiladi;
- bitta qatorda debet va kredit birga bo'lolmaydi;
- tuzatish faqat **storno** (`reverse()`) orqali — yozuv o'zgarmas;
- `reconcile()` nomuvozanat va filiallararo farqni topadi;
- `isInternal` bayrog'i konsolidatsiyada ichki o'tkazmani **elimination** qiladi.

**Filial ko'lami** butun tizim bo'ylab `branchFilter()` / `resolveBranchForWrite()`
bilan majburlangan, `fail-closed` (bo'sh ro'yxat → `AND FALSE`).

---

## 2. Subyektlar xaritasi (talab → mavjud entity)

| Talab qilingan | Mavjud model | Izoh |
|---|---|---|
| Student | `User` (role=student) | ✅ |
| Enrollment (student↔group) | `GroupMembership` | ✅ `joinedAt/leftAt/leftReason` |
| Group | `Group` | ✅ `branchId, courseId, roomId, teachers[]` |
| Teacher | `User` (role=teacher) + `TeacherGroupPeriod` | ✅ o'qituvchi↔guruh davri bor |
| Direction / course | `Course` + `CoursePrice` | ✅ narx tarixi bilan |
| Branch | `Branch` | ✅ |
| Room | `Room` | ✅ `capacity, areaM2` |
| Student payment | `StudentPayment` (plan) + `PaymentTransaction` (fakt) | ✅ **expected vs actual allaqachon ajratilgan** |
| Teacher salary/KPI | `TeacherCompensation`, `TeacherSalary`, `SalaryTransaction` | ✅ |
| Staff payroll/KPI | `StaffCompensation`, `KpiRule`, `StaffPayroll`, `StaffPayrollItem`, `StaffSalaryTransaction` | ✅ |
| Financial records | `JournalEntry`/`JournalLine`/`Account` | ✅ qo'sh yozuv |
| Roles/permissions | `Role`, `Permission` + `constants/permissions.js` | ✅ 100+ ruxsat |
| Approval workflow | `Approval` (limitdan oshsa hujjat yaratilmaydi) | ✅ |
| Audit | `ActivityLog` (132 yozuv), `PayrollAuditLog`, `ArchiveLog` | ⚠️ moliyaga xos emas |

**Xulosa: yangi Student/Group/Teacher/Room/Account/Expense jadvali KERAK EMAS.**

---

## 3. Faza-ma-faza bo'shliq tahlili

Belgilar: ✅ bor · 🟡 qisman · ❌ yo'q

| Faza | Holat | Nimasi bor / nimasi yo'q |
|---|---|---|
| 1. Moliyaviy yadro | 🟡 | Jurnal bor. **Yo'q:** `refund`, `owner_investment`, `owner_withdrawal` EntryKind; yozuvda **o'lchov (dimension) ustunlari yo'q** — studentId/teacherId/groupId/courseId/roomId/categoryId. Shusiz "o'qituvchi bo'yicha foyda" har safar qayta hisoblanadi. |
| 2. Chiqimlar | 🟡 | `Expense` + `ExpenseCategory` + tasdiq oqimi + soft-delete bor. **Yo'q:** takrorlanuvchi (recurring), fixed/variable, vendor bor lekin `personId` yo'q. Kategoriya seed'i bor (`seed:expense-categories`), lekin bazada 0 qator. |
| 3. Moliyaviy hisoblar | 🟡 | `Account(branchId, kind, name, isActive)` bor; `AccountKind` da cash/terminal/click/payme/bank bor. **Yo'q:** `uzcard`, `humo`; opening balance ustuni; **`PaymentMethod` enum faqat `cash|card`** — ya'ni Click/Payme hisoblari mavjud, lekin o'quvchi to'lovini ularga yozib bo'lmaydi. Hisoblar ko'rinishi (overview) UI yo'q. |
| 4. Debitorlik | 🟡 | `expectedAmount/paidAmount/status`, `DebtWriteOff`, proration, freeze — hammasi bor. **Yo'q:** aging (0-7/8-30/31-60/60+), collection rate, guruh/yo'nalish/o'qituvchi kesimidagi qarz. |
| 5. Chegirmalar | 🟡 | `Discount(type,value,scope,reason)` + `StudentPayment.discountApplied` bor. **Yo'q:** chegirma TURI (oilaviy/aksiya/referal/…), `approvedBy`, chegirma analitikasi. |
| 6. Qaytarimlar | ❌ | `DepositTxType.refund` bor, lekin u **ichki** (ortiqcha qoplama → depozit). Original to'lovga bog'langan, kassadan pul chiqaradigan qaytarim **yo'q**. |
| 7. Payroll → Finance | 🟡 | Maosh to'lovi jurnalga `EXPENSE` sifatida tushadi. **Yo'q:** `ExpenseCategory` bilan bog'lanmagan (Teacher Payroll kategoriyasi yo'q), `teacherId`/davr o'lchovi yo'q → "o'qituvchi tannarxi" jurnaldan olinmaydi. |
| 8. Fixed vs Variable | ❌ | `ExpenseCategoryKind` (operating/payroll/tax/capital) bor, lekin bu **boshqa o'q**. |
| 9. Takrorlanuvchi chiqim | ❌ | Umuman yo'q. |
| 10. Byudjet | ❌ | Umuman yo'q (`aiBudget` — AI token byudjeti, aloqasi yo'q). |
| 11. Cash flow | 🟡 | `journal.balances()` + `treasuryBalances()` qoldiqni beradi. **Yo'q:** ochilish→yopilish ko'rinishidagi hisobot, foyda≠naqd farqi. |
| 12. To'lov komissiyasi | ❌ | gross/fee/net yo'q. |
| 13. Egasi puli | ❌ | `equity` hisobi bor (faqat opening uchun ishlatiladi), oqim yo'q. |
| 14. Audit log | 🟡 | `ActivityLog` (HTTP darajasida), `PayrollAuditLog`. **Yo'q:** moliyaviy yozuvning eski→yangi qiymati, sabab. |
| 15. Foyda | 🟡 | `branchPnl.service.js` — revenue/expense/shortage/net/margin, elimination bilan. **Yo'q:** Gross Profit, Direct Costs, sozlanuvchi formula. |
| 16. O'qituvchi foydasi | ❌ | `branchTeachers.service.js` bor, lekin foyda emas. |
| 17. Yo'nalish foydasi | ❌ | Yo'q (Course kesimida moliya yig'ilmaydi). |
| 18. Guruh foydasi | 🟡 | `financeReport.groupBreakdown` — faqat tushum. Tannarx/foyda yo'q. |
| 19. Xona analitikasi | ❌ | `Room` bor, `GroupScheduleItem` bor (soat hisoblash mumkin), moliya bog'lanmagan. |
| 20. Dashboard | 🟡 | `FinanceReportPage.jsx` (115 qator): KPI, trend, guruh kesimi, ledger. **Yo'q:** foyda, xona, o'qituvchi, byudjet, aging, filtrlar, drill-down. |
| 21. Alertlar | 🟡 | `branchAlerts.service.js` + `Insight` modeli (AI) bor — infratuzilma tayyor. Moliyaviy qoidalar yo'q. |
| 22. Analitika qatlami | 🟡 | Servislar bor, lekin har biri o'z hisobini qiladi; umumiy aggregation qatlami yo'q. |
| 23. Ruxsatlar | 🟡 | `finance.read/pay/manage/approve/opening_balance`, `expenses.*`, `salary.*`, `payroll.*` bor. **Yo'q:** `finance.view_profitability`, `finance.manage_accounts`, `finance.manage_budgets`, `finance.approve_refund`, `finance.view_audit`. |
| 24. Frontend UX | 🟡 | shadcn/tailwind dizayn tizimi, `AiDomainInsights`, sheet/modal namunalari bor. Drill-down yo'q. |
| 25. "Nega?" | ❌ | Yo'q. |
| 26. To'g'rilik | 🟡 | Invariantlar kuchli. **⚠️ Barcha pul ustunlari `Float`** (quyida). |
| 27. Testlar | 🟡 | 44 test fayli (`moneyIsolation`, `moneyProperty`, `paymentRace`, `journalTreasury`, `journalWiring`, `ledger`, `invariantsPrisma`…). Yangi fazalar uchun test yo'q. |

---

## 4. Asosiy arxitektura qarori

### Jurnalni KENGAYTIRAMIZ, parallel "FinancialTransaction" jadvali YARATMAYMIZ

Faza 1 "financial transaction" jadvalini so'raydi. Uni alohida qilish
**ikkita haqiqat manbai** yaratardi: `JournalLine` "kassada qancha pul bor"
deydi, yangi jadval esa "qancha operatsiya bo'ldi" — va ular birinchi
xatodayoq ajralib ketardi (ayni shu xavf `ledger.service.js` izohida
tushuntirilgan: "balans ikkinchi joyda saqlanganida u MUQARRAR eskiradi").

Buning o'rniga:

1. **`EntryKind` ga qo'shiladi:** `refund`, `owner_investment`, `owner_withdrawal`,
   `payment_fee`. (INCOME/EXPENSE/TRANSFER/ADJUSTMENT allaqachon bor.)
2. **`JournalEntry` ga nullable o'lchov ustunlari:** `studentId`, `teacherId`,
   `groupId`, `courseId`, `roomId`, `membershipId`, `expenseCategoryId`,
   `staffId`, `periodYear`, `periodMonth`, `attachmentId`, `paymentMethod`.
   Hech biri majburiy emas — ijara chiqimida `studentId` bo'lmaydi
   (talabdagi "Do NOT force irrelevant relations" shu bilan bajariladi).
3. Shu ustunlar tufayli Faza 16–19 (o'qituvchi/yo'nalish/guruh/xona foydasi)
   **bitta `GROUP BY` ga** aylanadi — qayta hisoblash emas.

### `Account` modeli — Faza 3 uchun kengaytiriladi

Mavjud `Account` (branch + kind) allaqachon "moliyaviy hisob". Unga
`openingBalance`, `openingAt` qo'shiladi; `AccountKind` ga `uzcard`, `humo`;
`PaymentMethod` enum kengaytiriladi (`cash|card|click|payme|uzcard|humo|bank|transfer`).
**`currentBalance` USTUN SIFATIDA SAQLANMAYDI** — u jurnaldan hisoblanadi
(mavjud `balances()`), aks holda eskirgan ikkinchi haqiqat paydo bo'lardi.

---

## 5. ✅ BAJARILDI: pul ustunlari `Decimal` ga o'tkazildi

**Qaror:** to'liq o'tish (foydalanuvchi tanlovi). **Holat:** bajarildi.

Migratsiya: `20260819090000_money_float_to_decimal` — 71 ustun / 30 jadval,
faqat `ALTER ... SET DATA TYPE`, hech qanday `DROP`/`RENAME` yo'q.

* `numeric(18,2)` — pul summalari
* `numeric(18,4)` — stavkalar (valyuta kursi, foizlar): 33.3333% ni
  2 kasrga keltirish maoshni siljitardi
* **tegilmagan** (pul emas): `areaM2`, `prorationFactor`, `studentUnits`,
  `lessonHours`, `quantity`, baytlar, vaznlar/ballar, va
  `AiUsageLog.costUsd` (USD, sent ostidagi qiymatlar — 2 kasrga
  keltirilsa nolga aylanardi)

**JS tomonidagi xavf va yechim.** Prisma `Decimal` OBYEKTI qaytaradi va
unda `a + b` jimgina SATR BIRIKTIRISHGA aylanadi
(`"700000" + "300000" = "700000300000"`) — xato emas, shunchaki noto'g'ri
son. 26 faylni qo'lda tuzatish o'rniga to'siq BITTA joyda:
`config/prisma.js` dagi klient kengaytmasi natijadagi Decimal'ni songa
keltiradi.

> **Tuzoq:** `v.constructor.name === "Decimal"` tekshiruvi ISHLAMAYDI —
> Prisma decimal.js ni minifikatsiya qiladi va sinf nomi `i` bo'ladi.
> `Prisma.Decimal.isDecimal(v)` ishlatilgan. Birinchi urinishda aynan shu
> sabab normalizatsiya jimgina o'chiq qolgan edi.

**Xom SQL kengaytmadan o'tmaydi.** Shu sababli 15 ta `::double precision`
kasti `::numeric` ga almashtirildi — ular ATOMIK PUL YOZISH yo'llarida edi
(`applyPaidDelta`: o'quvchi to'lovi, o'qituvchi maoshi, xodim payroll'i,
depozit balansi). Aks holda Postgres butun ifodani float'da hisoblab,
aniqlik aynan pul yozilayotgan joyda yo'qolardi.

**Ko'paytirish/bo'lish** (foiz, proratsiya, ulush) uchun `utils/money.js`:
`allocate()` yaxlitlash yo'qotishini oldini oladi — 1 000 000 ni 3 ga
bo'lganda ulushlar yig'indisi HAR DOIM 1 000 000 bo'lib qoladi.

## 6. Implementatsiya rejasi (buyurtma qilingan tartibda)

| Step | Ish | Migratsiya |
|---|---|---|
| 2–3 | Ma'lumot modeli + Prisma migratsiya: EntryKind qo'shimchalari, JournalEntry o'lchovlari, Account opening balance, PaymentMethod kengaytmasi, `RecurringExpense`, `Budget`/`BudgetLine`, `Refund`, `FinancialAuditLog`, `Expense.costType`, `Discount` kengaytmasi, to'lov komissiyasi ustunlari | ✅ yangi migratsiya |
| 4 | `financialTransaction.service.js` — yagona yozuv nuqtasi (jurnal ustida) | — |
| 5 | Hisoblar + o'tkazmalar (ichki transfer ≠ daromad) | — |
| 6 | Chiqimlar: recurring, fixed/variable, audit | — |
| 7 | Payroll → chiqim integratsiyasi (o'lchov bilan) | — |
| 8 | Debitorlik + aging, chegirma, qaytarim | — |
| 9–10 | Cash flow, byudjet vs fakt | — |
| 11–15 | Analitika qatlami: summary/revenue/expense/teacher/direction/group/room | — |
| 16–17 | Dashboard + alertlar + "Nega?" | — |
| 18 | Ruxsatlar + audit log | seed |
| 19–20 | Testlar + regressiya tekshiruvi | — |

Har bosqichdan keyin: o'zgargan fayllar → DB o'zgarishi → API o'zgarishi →
frontend o'zgarishi → migratsiya holati → testlar → regressiya.

---

## 7. Buzilmasligi kerak bo'lgan narsalar (regressiya ro'yxati)

Har bosqichdan keyin quyidagilar ishlaydi:

```
npm run test:money          npm run test:journal        npm run test:journal-wiring
npm run test:money-prop     npm run test:race           npm run test:ledger
npm run test:invariants     npm run test:expenses-chain npm run test:salary-chain
npm run test:opening        npm run test:staff-payroll  npm run test:branch-analytics
npm run test:leak           npm run test:scope          npm run test:priv
```

---

# STEP 4 ILOVASI: JURNALGA MUSTAQIL YOZADIGAN YO'LLAR (audit)

`FinancialTransactionService` yaratilgach uchta modul hamon `journal.post()`
ni TO'G'RIDAN-TO'G'RI chaqiradi. Bu **e'tibordan chetda qolgan joy emas** —
tekshirilgan va ATAYLAB qoldirilgan qaror.

Sababi: ular servisdagi amallarning DUBLIKATI EMAS. Uchalasi ham servis
qamramaydigan boshqa moliyaviy hodisani ifodalaydi va har birining O'Z
idempotentlik himoyasi bor.

```
cashTransfer.service.js
  → o'z posting mantig'i     (transfer_send / transfer_receive / inter_branch)
  → o'z idempotentligi        claimTransfer(): updateMany WHERE status = <kutilgan>
                              ikkinchi urinish count=0 → 409, jurnal yozilmaydi
  → tranzaksiya ichida        holat AVVAL, jurnal keyin — bittada
  → reconcile() himoyasi      due_from/due_to juftligi tekshiriladi
  → SAQLANADI

shift.service.js
  → o'z posting mantig'i      (shift_close — kassir kamomadi/ortiqchasi)
  → o'z idempotentligi        updateMany WHERE status = 'open' → ikki marta
                              yopilmaydi; + qisman unique indeks
  → tranzaksiya ichida        holat AVVAL, jurnal keyin — bittada
  → SHORTAGE hisobi           xarajat EMAS, yo'qotish (ataylab ajratilgan)
  → SAQLANADI

studentTransfer.service.js
  → o'z posting mantig'i      (inter_branch JUFTLIGI: chiquvchi + kiruvchi)
  → filiallararo depozit ko'chirish — o'quvchi hujjati o'zgarmaydi,
    faqat "pul qaysi filial kassasida" o'zgaradi
  → TAKRORLANADIGAN hodisa    bir o'quvchi bir necha marta ko'chirilishi mumkin
  → tranzaksiya ichida        a'zolik yangilanishi bilan bitta amalda
  → SAQLANADI
```

### Nega ular hozir majburan servisga ko'chirilmaydi

* **Xavf foydadan katta.** `cashTransfer` dagi `claimTransfer()` — kodning
  o'z izohi bilan aytganda "ENG XAVFLI JOY": ikki parallel `receive`
  ilgari kassani IKKI BAROBAR oshirib yuborardi. U hozir to'g'ri
  ishlaydi. Uni faqat bir xillik uchun qayta yozish ishlab turgan
  kafolatni xavf ostiga qo'yardi.
* **Ular dublikat emas.** "Migratsiya qilingan amallar uchun ikkinchi
  buxgalteriya implementatsiyasi qolmasin" talabi bajarilgan:
  `journalPosting.helper.js` O'CHIRILDI va to'lov / chiqim / maosh /
  depozit uchun boshqa yo'l YO'Q.

### Keyinchalik (ixtiyoriy, alohida qadam)

Ularga ham `postingKey` va standart `FinancialAuditLog` berilishi mumkin:

| Yo'l | Taklif qilinadigan kalit | E'tibor |
|---|---|---|
| cashTransfer send | `transfer_send:<id>` | bitta yozuv |
| cashTransfer receive | `transfer_recv_from:<id>` / `transfer_recv_to:<id>` | IKKI yozuv — kalit ham ikkita |
| shift close | `shift_close:<shiftId>` | bitta yozuv |
| studentTransfer | `student_move:<studentId>:<at>` | takrorlanadi — sana kalitga kirishi SHART |

Bu **qo'shimcha himoya qatlami** bo'lardi (hozirgi shartli `updateMany`
o'rniga emas, ustiga). Shoshilinch emas.

---

# STEP 5: TAHLIL QATLAMI — FORMULALAR VA QOIDALAR

> Modul: `src/modules/financeAnalytics/` · Marshrut: `/api/finance-analytics`
> **FAQAT O'QISH.** Bu qatlamda birorta yozuv endpoint'i yo'q.

## Pul aniqligi

Barcha yig'indi **SQL'da** (`numeric`) hisoblanadi, JavaScript'da emas.
JS'ga tayyor natija keladi va chegarada songa aylanadi. Nisbatlar
(`marja`, `o'sish %`) `utils/money.js` orqali — Decimal ustida.

## Asosiy formulalar

| Ko'rsatkich | Formula | Manba |
|---|---|---|
| Brutto daromad | `SUM(revenue.credit)` | jurnal |
| Qaytarim | `SUM(revenue.debit)` | jurnal |
| **Netto daromad** | `SUM(revenue.credit − revenue.debit)` | jurnal |
| Maosh | `SUM(expense.debit − credit) WHERE kind='salary'` | jurnal |
| Komissiya | `SUM(payment_fee.debit − credit)` | jurnal |
| Operatsion xarajat | `SUM(expense) + SUM(payment_fee)` | jurnal |
| **To'g'ridan-to'g'ri xarajat** | `maosh + komissiya` | jurnal |
| **Hissa foydasi** | `netto daromad − to'g'ridan-to'g'ri xarajat` | jurnal |
| **Hissa marjasi** | `hissa foydasi / netto daromad` | — |
| Operatsion natija | `netto daromad − barcha xarajat − kamomad` | jurnal |
| Kassa qoldig'i | `SUM(debit − credit)` xazina hisoblari bo'yicha | jurnal |
| Kutilgan | `SUM(expectedAmount) WHERE NOT writtenOff` | StudentPayment |
| Undirilgan | `SUM(paidAmount) WHERE NOT writtenOff` | StudentPayment |
| Qoldiq | `SUM(GREATEST(expected − paid, 0))` | StudentPayment |
| **Undirish darajasi** | `undirilgan / kutilgan` | StudentPayment |
| Chegirma darajasi | `chegirma / BARCHA planning baseFee` | StudentPayment |
| Qaytarim darajasi | `qaytarim / BRUTTO daromad` | jurnal |
| Byudjet farqi | `fakt − byudjet` (musbat = oshdi) | Budget + jurnal |
| Xona bandligi | `band soat / mavjud soat` | jadval + taxmin |

**Nolga bo'lish:** hamma joyda `null` qaytadi, `0` emas. `0%` "o'zgarish
yo'q" degan ma'noga ega bo'lardi, holbuki haqiqat — "taqqoslab bo'lmaydi".

## Atributsiya qoidalari

**O'qituvchi.** Daromad o'qituvchiga faqat jurnal yozuvida `teacherId`
muhrlangan bo'lsa bog'lanadi; u esa **aynan bitta** `TeacherGroupPeriod`
mos kelganda muhrlanadi. Ikki o'qituvchili guruhda o'lchov NULL qoladi.
Har javobda `attribution.coveragePercent` bor — foydalanuvchi qamrovni
ko'rib turadi.

**Yo'nalish / xona.** Guruhdan meros olinadi (`Group.courseId`,
`Group.roomId`) va yozuv yaratilganda **nusxalanadi**. Guruh xonasi keyin
o'zgarsa, o'tmishdagi yozuv o'z xonasida qoladi — tarix qayta yozilmaydi.

**Filial.** `isInternal` yozuvlar chiqarib tashlanadi, aks holda
filiallararo inkassatsiya tarmoq aylanmasini ikki barobar ko'rsatardi.

**Xona — FOYDA HISOBLANMAYDI.** Daromadni xonaga bog'lash mumkin,
xarajatni esa yo'q (ijara butun binoga to'lanadi). Shuning uchun bo'lim
nomi "Room Revenue & Utilization".

## Pul oqimi qoidasi

Faqat **xazina hisoblari** harakatidan hisoblanadi. Uch bo'lim:
operatsion / moliyalashtirish (egasining puli) / ichki. Egasining puli
daromad ham, xarajat ham EMAS; ichki o'tkazma nettosi nolga teng.

`yopilish = ochilish + operatsion + moliyalashtirish + ichki`

## Debitorlik yoshi

To'lov muddati = **oyning oxirgi kuni** (bazada individual shartnoma
muddati yo'q — bu qaror, kashfiyot emas). Guruhlar: muddati kelmagan,
0–7, 8–30, 31–60, 60+ kun.

## Ogohlantirish qoidalari

Chegaralar `alerts.service.js` → `THRESHOLDS` da, bitta joyda:
chiqim o'sishi ≥20%, foyda pasayishi ≤−10%, undirish −5 punkt yoki <85%,
60+ qarz ≥1 mln, chegirma-daromad farqi ≥15 punkt, qaytarim ≥2×,
bandlik <40%, byudjetdan ≥10%, marja <20%.

Har ogohlantirish `metric`, `currentValue`, `comparisonValue` va
subyekt ID larini qaytaradi — matn **haqiqiy ikki raqamdan** yig'iladi,
generatsiya qilinmaydi.

## So'rov optimizatsiyasi

* Har kesim — **bitta `GROUP BY`**, N+1 yo'q. Nomlar bitta `IN (...)`
  so'rovi bilan yechiladi.
* Vaqt qatori `date_trunc` bilan **SQL'da** guruhlanadi.
* 120k yozuv / 240k qator ustida o'lchandi: o'qituvchi foydaliligi
  **27 ms**, xulosa **18 ms**, yillik dinamika **29 ms**
  (`journal_entries_date_idx` → Bitmap Index Scan).
* **Tuzatilgan sekinlik:** oylik plan davri ilgari
  `make_date(year, month, 1) BETWEEN ...` bilan filtrlanardi — ustun
  ustidagi funksiya indeksni ISHLATTIRMAYDI. 97 500 qatorda
  Seq Scan **27 ms** edi; `year BETWEEN ... AND (year*12+month) BETWEEN ...`
  shakli `student_payments_year_month_status_idx` ni ishlatib **11 ms**
  beradi. Farq jadval o'sishi bilan kengayadi.
  Qarang `analyticsFilter.js` → `planPeriodClause()`.

---

# STEP 5.1: MOLIYA RUXSATLARI MODELI

> Foydalilik UI si ochilishidan **OLDIN** joriy qilindi — u maosh
> ma'lumotini oshkor qiladi.

## Model

| Kalit | Nimani qo'riqlaydi | Holat |
|---|---|---|
| `finance.read` | umumiy o'qish: xulosa, daromad, chiqim, byudjet, ogohlantirish | mavjud edi |
| `finance.create_expense` | chiqim yozish | **yangi** (eski: `expenses.create`) |
| `finance.manage_expense` | kategoriya, chiqimni o'chirish | **yangi** (eski: `expenses.manage`) |
| `finance.manage_accounts` | moliyaviy hisoblar | **yangi** |
| `finance.manage_refunds` | qaytarimlar | **yangi** |
| `finance.manage_transfers` | o'tkazma va inkassatsiya | **yangi** (eski: `finance.pay`) |
| `finance.view_profitability` | ⚠ foydalilik — **maosh tannarxini ochadi** | **yangi** |
| `finance.view_cashflow` | pul oqimi, kassa qoldiqlari | **yangi** |
| `finance.view_receivables` | qarzdorlik, undirish darajasi | **yangi** |
| `salary.read` / `payroll.read` | maosh ma'lumoti | mavjud edi |

## Marshrutlarga bog'lanishi

```
/finance-analytics/summary|revenue|expenses|budget|alerts
    → finance.read
/finance-analytics/cash-flow*
    → finance.view_cashflow
/finance-analytics/receivables*
    → finance.view_receivables
/finance-analytics/directions|groups|rooms|branches
    → finance.view_profitability
/finance-analytics/teachers
    → finance.view_profitability  VA  (salary.read YOKI payroll.read)
```

`/teachers` **ikki qavatli**, chunki u har bir o'qituvchining tannarxini
ismi bilan birga qaytaradi. `requirePermission` o'zi OR ishlatgani uchun
ikkita middleware ketma-ket qo'yilgan.

`/directions`, `/groups`, `/rooms`, `/branches` ham foydalilik ruxsatini
talab qiladi: ular `payroll` va `directCosts` ustunlarini qaytaradi va
guruhda bitta o'qituvchi bo'lsa maosh baribir kelib chiqadi.

## Moslik (mavjud rollar buzilmadi)

`helpers/permission.helper.js` → `PERMISSION_IMPLIES`:

```
expenses.create  → finance.create_expense
expenses.manage  → finance.manage_expense, finance.create_expense
finance.manage   → finance.manage_accounts, finance.manage_refunds
finance.pay      → finance.manage_transfers
```

Ya'ni eski kalit berilgan xodim yangi nomni talab qiladigan
marshrutdan ham o'tadi — hech kim huquqini yo'qotmaydi.

### `view_*` larga moslik ATAYLAB BERILMAGAN

`finance.read` ularni **qamramaydi**. Aks holda yangi kalitlar bezakka
aylanardi: "moliyani ko'rish" huquqi bo'lgan har kim o'qituvchi maoshi
tannarxini ham ko'raverardi — ajratishning butun ma'nosi yo'qolardi.

Bu xavfsiz, chunki `view_*` FAQAT yangi `/finance-analytics`
marshrutlarini qo'riqlaydi — ular hali hech kimga ochilmagan.

## Rollarga tarqalishi

* **owner** — `permissions.seed.js` barcha kalitlarni qayta biriktiradi
  (`set`), ya'ni yangi kalit avtomatik tushadi.
* **director** — seed MAVJUD rolga TEGMAYDI (owner uni qo'lda
  o'zgartirgan bo'lishi mumkin). Shuning uchun
  `npm run migrate:director-full` ishlatiladi: u
  `permissionScope.js` dan hisoblangan "hammasi minus owner-only"
  ro'yxatini beradi, owner qo'shgan qo'shimcha kalitlarni SAQLAYDI va
  sizib kirgan owner-only kalitlarni OLIB TASHLAYDI.

  > Bu skript Mongoose'da qolib ketgan va **ishlamas holatda** edi —
  > STEP 5.1 da Prisma'ga ko'chirildi.

**Yangi o'rnatishda tartib:**
```
npm run seed:permissions      # katalog + owner
npm run migrate:director-full # mavjud direktor roliga yangi kalitlar
```
Ishlab turgan server ruxsat keshini 5 daqiqa ushlaydi
(`permissionsVersion` oshiriladi) — darhol kerak bo'lsa qayta ishga tushiring.

