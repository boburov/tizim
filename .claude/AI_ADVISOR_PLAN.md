# AI COO — Bayyina ERP uchun AI maslahatchi tizimi

**Holat:** reja (v1 draft) · **Sana:** 2026-07-30
**Manba:** kodbaza tahlili (Claude) + Gemini 3 Pro maslahati

---

## 0. Bir jumlada

Deterministik hisoblash dvigateli (MongoDB aggregation) barcha raqamlarni, ballarni va
sabablarni chiqaradi; LLM faqat **tarjimon va sintezator** — o'zbekcha matn yozadi va
tabiiy tildagi savollarga tayyor faktlar asosida javob beradi. LLM hech qachon raw
Mongo hujjatini ko'rmaydi va hech qachon raqam o'ylab topmaydi.

Gemini bu bo'linishni tasdiqladi va asosiy xavfni aniq nomladi: **"AI Theater"** —
sayoz ma'lumot ustida ishonchli ko'rinadigan dashboard. Ikki hafta ichida egasi
ishonchni yo'qotadi.

---

## 1. Kodbazada nima BOR (tekshirilgan)

**Backend:** Node 24 · Express 4 · Mongoose 8 · Agenda · zod · pino · ESM `@/` alias
**Frontend:** React 19 · Vite · RTK · TanStack Query · shadcn/ui · Tailwind · Recharts
**Izolatsiya:** ko'p filialli, `AsyncLocalStorage` orqali
([branchContext.helper.js](server/src/helpers/branchContext.helper.js))

Mavjud modellar AI uchun yetarli darajada boy:

| Model | AI uchun nima beradi |
|---|---|
| `Attendance` | status (present/absent/excused/exempt), `lateMinutes`, `dateKey`, `slot`, `history[]` |
| `Grade` | kunlik 1–5 ball, `history[]` |
| `GroupMembership` | `joinedAt`/`leftAt`/`leftReason`/`leftReasonDetail` → **churn labellari tayyor** |
| `StudentPayment` | `expectedAmount`/`paidAmount`/`status`/`writtenOff` → qarz signali |
| `Lead` | `status`, `statusHistory[]`, `source`, `direction`, `followUpAt`, `rejectionReason` |
| `TeacherAttendance`, `TeacherAbsence`, `TeacherGroupPeriod`, `TeacherSalary` | o'qituvchi yuklamasi |
| `Feedback`, `StudentFreeze`, `Holiday`, `Notification*` | qo'shimcha signal + yetkazish kanali |

Allaqachon qurilgan analitika (AI emas, lekin poydevor):
`adminDashboard` (overview, cashflow, studentFlow, **retention**, churnedStudents,
studentStats), `financeReport` (summary, trend, groupBreakdown, ledger, writeOffs),
frontendda `studentRetention` + `studentStats` + `rating`.

> **Muhim:** `GroupMembership.leftReasonDetail` mavjudligi — bu oltin. Churn
> modelini o'qitish uchun **haqiqiy tarixiy labellar bor**. Ko'pchilik ERPda bu yo'q.

---

## 2. Kodbazada nima YO'Q (v1 ni belgilaydigan cheklovlar)

Bularsiz so'ralgan funksiyalarning bir qismi **halol emas**:

| Yo'q narsa | Ta'siri |
|---|---|
| **`Course` modeli** | `Group`da `direction`/`course` maydoni **yo'q** (faqat `name`, `schedule`, `teachers[]`, `branchId`). "Qaysi kurs eng foydali?" va "yana bitta IELTS guruh oching" — **bugun hisoblab bo'lmaydi**. Faqat guruh darajasida. |
| **Homework modeli** | "uy vazifasi bajarilishi" signali — mavjud emas |
| **Exam / Quiz / Mock model** | IELTS/CEFR bashorati uchun **hech qanday kompetensiya ma'lumoti yo'q**. `Grade` — kunlik 1–5, bu *ishtirok*, *bilim* emas |
| **Lead qo'ng'iroq jurnali** | `Lead.notes` — erkin matn. "Eng yaxshi qo'ng'iroq vaqti" va "suhbat xulosasi" uchun **ma'lumot yo'q** |
| **O'qituvchi baholash so'rovnomasi** | "student satisfaction" — `Feedback` shikoyat qutisi, reyting emas |
| **Xarajat kategoriyasi** | "marketing +18%, elektr +7%" uchun kategoriyalangan xarajat kerak — `SalaryTransaction` bor, umumiy xarajat taksonomiyasi tekshirilishi kerak |

**Gemini bu bo'yicha aniq:** *"IELTS Prediction — Impossible. 1–5 marks are 'effort'
metrics, not 'competence' metrics."* Men roziman. Buni v1da qilish — mahsulotni
o'ldirish.

---

## 3. Arxitektura — 5 qatlam

```
┌─ 1. SIGNALS ────────────────────────────────────────────┐
│  modules/ai/signals/*.signal.js                         │
│  Sof MongoDB aggregation → tipli raqamli feature'lar     │
│  branchMatchStage() / branchGroupMatchStage() MAJBURIY   │
│  LLM YO'Q. Deterministik. Testlanadigan.                │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─ 2. SCORING ────────────────────────────────────────────┐
│  Shaffof vaznli-additiv model (ML EMAS)                 │
│  Har bir ball O'Z hissa qo'shuvchi faktorlarini qaytaradi│
│  Vaznlar → AiConfig hujjati (owner sozlay oladi)        │
│  → "Sabab" matematikadan chiqadi, gallyutsinatsiyadan emas│
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─ 3. INSIGHT (yangi model) ──────────────────────────────┐
│  Saqlanadigan hujjat: dedup, tayinlash, o'lchash uchun  │
│  { branchId, subjectType, subjectId, kind, severity,    │
│    score, confidence, factors[], sourceRefs[],          │
│    recommendedActions[], expectedImpact,                │
│    status: open|acked|done|dismissed, engineVersion }   │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─ 4. LLM (tor va tuzilgan) ──────────────────────────────┐
│  A) Narrator: factors JSON → o'zbekcha matn             │
│  B) NL Assistant: tool-calling faqat oq ro'yxatdagi     │
│     read-only aggregation "tool"lar ustidan             │
│  Raw query generatsiya YO'Q. DB access YO'Q.            │
│  Strict JSON schema. Keshlanadi. Byudjet cheklangan.    │
└────────────────────┬────────────────────────────────────┘
                     ▼
┌─ 5. ACTION CENTER + UI ─────────────────────────────────┐
│  Ochiq Insight'lar ustidan reytingli navbat             │
│  priority = impact_som × probability × urgency_decay    │
│  shared/components/ai/* → har bir modulga o'rnatiladi   │
└─────────────────────────────────────────────────────────┘
```

### Nega bu bo'linish (Gemini: "90% matematika, 10% nasr")

- LLM **hech qachon** raw Mongo hujjatini ko'rmaydi. Faqat Signals qatlami
  tayyorlagan "Fact Sheet"ni ko'radi.
- Agar raqam Fact Sheet'da yo'q bo'lsa — LLM u haqda gapira olmaydi.
- Har bir insight `sourceRefs[]` massiviga ega. **Gemini qoidasi:** *"If you can't
  link to the raw data, the AI isn't allowed to show the insight."*

---

## 4. Ishonch balli — teatr emas, formula

Ishonch = "AI qanchalik ishonchli" emas, balki **"menda qancha ma'lumot bor edi"**.

```
confidence = dataDensity × recency × signalConsistency

dataDensity      = min(1, observedLessons / expectedLessons)
recency          = exp(-daysSinceLastSignal / 14)
signalConsistency= 1 - stdev(normalizedFactors)   // faktorlar bir-biriga zid emasmi
```

**UI qoidasi:** `confidence < 0.4` → ball ko'rsatilmaydi. O'rniga
**"Ma'lumot yetarli emas"** badge'i. Bu bitta qoida mahsulotning ishonchini saqlaydi.

---

## 5. Churn modeli — sovuq start (ML yo'q, ekspert tizimi)

Bir markazda 3–12 oylik ma'lumot va bir necha yuz o'quvchi bor. ML foydasiz.
**Vaznli Bayes priorlari** ishlatiladi, vaznlar `AiConfig`da saqlanadi va owner
ularni sozlay oladi.

```
risk = σ( Σ wᵢ·vᵢ - b )        // logistik shakl, [0,1] ga siqiladi

v₁  Davomat pasayishi (oxirgi 4 hafta vs oldingi 4)    w = 0.30
v₂  Ketma-ket qoldirilgan darslar (streak)              w = 0.20
v₃  Faol qarz kunlari (writtenOff=false)                w = 0.20
v₄  Baho trendi (chiziqli regressiya qiyaligi)          w = 0.15
v₅  Guruhdagi umumiy churn (guruh effekti)              w = 0.10
v₆  Muzlatish tarixi (StudentFreeze)                    w = 0.05
```

**Kalibrlash:** `GroupMembership` da `leftReason: "removed"` bo'lgan tarixiy yozuvlar
bor → **backtest qilish mumkin**. Har chorakda vaznlarni tarixga qarshi qayta
tekshirish. Bu ML emas, lekin o'lchanadigan.

---

## 6. Moliya bashorati — kogortli roll-forward (mavsumiy AI emas)

Gemini haq: o'quv markazi — **obuna/kogort biznesi**, vaqt qatori emas.

```
Rev(keyingi oy) = Σ(faol o'quvchi × oylik to'lov × (1 - churn_bashorati))
                + (faol lidlar × tarixiy konversiya × o'rtacha to'lov)
                - kutilayotgan yomon qarz
```

Anomaliya: `z = (joriy_oy_xarajat - MA₆) / σ₆`; `|z| > 2` → "G'ayrioddiy sarf" flagi.

Bu Holt-Winters yoki ARIMAdan **aniqroq**, chunki har bir o'quvchining kutilgan
to'lovi allaqachon `StudentPayment.expectedAmount` da yozilgan.

---

## 7. Model tanlash va narx — **Gemini** (tekshirilgan, 2026-07-30)

**Qaror:** LLM provayderi — Google Gemini. SDK: `@google/genai` (npm).

Narxlar ([ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)):

| Model | Kirish $/1M | Chiqish $/1M | Kesh $/1M | Batch |
|---|---|---|---|---|
| `gemini-2.5-flash-lite` | $0.10 | $0.40 | $0.01 | −50% |
| `gemini-2.5-flash` | $0.30 | $2.50 | $0.03 | −50% |
| `gemini-3.1-flash-lite` | $0.25 | $1.50 | $0.025 | −50% |
| `gemini-3.6-flash` | $1.50 | $7.50 | $0.15 | −50% |
| `gemini-3.1-pro-preview` | $2.00–4.00 | $12.00–18.00 | $0.20–0.40 | −50% |

**Taqsimot:**

| Vazifa | Model | Sabab |
|---|---|---|
| Tungi narrator (yuqori hajm) | `gemini-2.5-flash` | Fact Sheet → o'zbekcha nasr. Flash-Lite ham ishlaydi, lekin o'zbek tili sifati uchun Flash xavfsizroq |
| Kunlik ijroiya xulosa | `gemini-3.1-pro-preview` | Kuniga 1 marta, sintez sifati muhim |
| NL biznes assistenti | `gemini-3.1-pro-preview` | Ko'p qadamli tool-calling, xato narxi yuqori |

**Xarajatni kamaytiradigan uchta narsa:**

1. **Batch API** — barcha Gemini modellarida **50% chegirma**. Tungi narrator
   aynan shu rejimda ishlaydi.
2. **Context caching** — system prompt + JSON skema barcha so'rovlarda bir xil,
   `$0.03/1M` (Flash) — kirish narxining 1/10 qismi.
3. **Faqat o'zgargan narsani narrate qilish** — 500 o'quvchining hammasi emas,
   faqat ochiq Insight'i borlar (~50–80 ta/kecha).

**Taxminiy oylik xarajat (500 o'quvchi, 1 filial):**

| Ssenariy | Hisob | Oylik |
|---|---|---|
| Narrator: ~70/kecha, Flash + Batch ($0.15/$1.25) | 3.15M in + 0.84M out | **≈ $1.5** |
| Kunlik exec xulosa (3.1 Pro) | 240K in + 45K out | ≈ $1 |
| NL assistent, 300 savol/oy (3.1 Pro) | 1.8M in + 240K out | ≈ $6.5 |
| **Jami** | | **≈ $9/oy** |

Barcha 500 o'quvchi har kecha narrate qilinsa ham: ≈ $11/oy qo'shiladi.
Xarajat amalda cheklovchi omil emas — cheklov **ma'lumot sifati**.

**Muhandislik eslatmalari:**
- `GEMINI_API_KEY` → `config/env.js` da zod bilan validatsiya
- Strukturaviy chiqish: `response_format: { type: "text", mime_type: "application/json", schema }`
- LLM chaqiruvi **hech qachon** request yo'lida emas — faqat Agenda job ichida
  (narrator) yoki alohida rate-limited endpoint orqali (assistent)
- Har bir chaqiruv `AiUsageLog` ga yoziladi: model, token, narx, latency

---

## 8. NL assistent xavfsizligi

1. **Intent → ToolID.** LLM foydalanuvchi savolini oq ro'yxatdagi tool'ga
   moslaydi (`QUERY_REVENUE_TREND`, `QUERY_STUDENT_RISK_LIST`, ...).
   LLM **hech qachon** Mongo query ko'rmaydi va yozmaydi.
2. **Filial injeksiyasi server tomonda.** `branchId` `AsyncLocalStorage` dan
   olinadi, LLM parametridan **emas**. Cross-branch sizib chiqish mumkin emas.
3. **Ruxsat tekshiruvi.** Har bir tool `requirePermission` ga bog'lanadi —
   moliya tool'i `finance.read` siz ishlamaydi.
4. **Rad etish strategiyasi.** Tool `null` qaytarsa yoki LLM tool chiqishida
   bo'lmagan raqamni ishlatmoqchi bo'lsa → qat'iy javob:
   *"Bu savolga javob berish uchun menda tasdiqlangan ma'lumot yetarli emas."*
5. **Auditing.** Har bir AI javobi `ActivityLog` ga: kim so'radi, qaysi tool'lar
   chaqirildi, qaysi Insight'lar ko'rsatildi.

---

## 9. Eng katta xavf va unga qarshi dizayn

**Xavf:** egasi bitta noto'g'ri, lekin ishonchli tavsiyadan keyin tizimga
ishonishni to'xtatadi. (Gemini buni "The Hallucinated Scolding" deb ataydi:
AI "O'qituvchi X yomon ishlayapti" deydi, aslida u qiyin guruhni olgan.)

**Uchta himoya:**

1. **"Ishingni ko'rsat" havolasi.** Har bir insight `sourceRefs[]` ga ega va
   UI da har bir sabab bosiladigan havola. Havola yo'q → insight ko'rsatilmaydi.
2. **Kontekst normalizatsiyasi.** O'qituvchi balli guruh qiyinligiga moslashtiriladi
   (guruh boshlang'ich darajasi, o'quvchi bazaviy ko'rsatkichi). Xom o'rtacha —
   hech qachon.
3. **Yopiq halqa.** `acked`/`done`/`dismissed` natijalari bashorat qilingan ta'sirga
   qarshi o'lchanadi. "Sizga aytilgan 12 ta yuqori xavfli o'quvchidan 9 tasi
   qoldi" — bu ishonchni qaytaradigan yagona narsa.

---

## 10. Fazalar

### Faza 1 — Poydevor (2.5–3.5 hafta) · **eng katta ROI**

- **`Course` modeli + `Group.courseId` + migratsiya** *(qaror: Faza 5 dan ko'chirildi)*
  — kurs foydaliligi va "yana IELTS guruh oching" v1 da ishlaydi
- `modules/ai/` skeleti: `signals/`, `scoring/`, `services/`, `handlers/`, `validators/`
- `Insight` + `AiConfig` modellari
- Signals: davomat trendi, baho trendi, qarz holati, guruh churn darajasi
- **Student Churn Risk** scoring + backtest skripti (tarixiy `leftReason` ga qarshi)
- **Payment Risk** ranking (mavjud `StudentPayment` yetarli)
- Agenda job: `ai-nightly-recompute` (filial bo'yicha)
- Frontend: `shared/components/ai/` — `AiRiskBadge`, `AiInsightCard`
- O'quvchilar ro'yxati va profiliga risk badge
- **LLM hali YO'Q** — faktorlar shablonli o'zbekcha matn bilan ko'rsatiladi

> Faza 1 oxirida tizim **LLMsiz ham foydali**. Bu ataylab: agar deterministik
> qatlam qiymat bermasa, LLM uni qutqarmaydi.

### Faza 2 — Action Center + Moliya (2–3 hafta)

- **AI Action Center** — reytingli kunlik vazifalar navbati
  (`priority = impact_som × probability × urgency_decay`)
- Insight yopish oqimi: `acked` → `done` → natija o'lchash
- Moliya: kogortli daromad bashorati, pul oqimi ogohlantirishi, xarajat z-score
- Davomat anomaliya aniqlash (haftalik naqsh: "dushanbalarni qoldiradi")
- Telegram bildirishnomasi orqali ertalabki digest (mavjud `Notification` tizimi)
- Frontend: `AiForecastWidget`, `AiActionList`

### Faza 3 — LLM qatlami (2 hafta)

- Narrator servis: `factors[]` → o'zbekcha nasr (Haiku 4.5 + Batches + caching)
- Kunlik **Executive Summary** (Opus 5)
- Lead scoring (mavjud `statusHistory` + `source` + `direction` asosida)
- Teacher performance score — **qiyinlik moslashtirilgan**
- Frontend: `AiInsightPanel` har bir modulga

### Faza 4 — NL assistent (2 hafta)

- Oq ro'yxatdagi tool registri (12–15 ta read-only aggregation tool)
- Tool-calling loop, `branchId` server tomonda injeksiya
- Rad etish strategiyasi + audit logging
- UI: global command palette ichida (alohida chatbot sahifasi **YO'Q**)

### Faza 5 — Ma'lumot kengaytirish (schema qo'shimchalari)

Faqat 1–4 qiymat bergandan keyin:

| Yangi model | Ochadigan funksiya |
|---|---|
| ~~`Course` + `Group.courseId`~~ | ✅ **Faza 1 ga ko'chirildi** |
| `ExamResult` {type, sections{L,R,W,S}, score, date} | **"Baholangan tayyorlik"** (IELTS bashorati emas) |
| `LeadActivity` {leadId, type: call/visit, outcome, at} | Eng yaxshi qo'ng'iroq vaqti, real konversiya modeli |
| `Homework` {group, student, dateKey, status} | Uy vazifasi signali |
| `TeacherObservation` (menejer rubrikasi) | Bias-kamaytirilgan o'qituvchi balli |
| `ExpenseCategory` | "Marketing +18%, elektr +7%" |

---

## 11. v1 dan NIMA OLIB TASHLANADI

| Funksiya | Sabab |
|---|---|
| **IELTS/CEFR bashorati** | Kompetensiya ma'lumoti yo'q. `ExamResult` modelisiz bu **yolg'on**. Faza 5 dan keyin — va **"Baholangan tayyorlik"** deb, diapazon bilan ("5.5–6.0"), "IELTS bashorati" deb emas |
| **"Eng yaxshi qo'ng'iroq vaqti"** | Qo'ng'iroq jurnali yo'q. Taxmin |
| **Lead suhbat xulosasi** | `Lead.notes` — erkin matn, transkript emas |
| **O'qituvchi yuklamasini qayta taqsimlash** | Gemini: *"HR nightmare to automate."* Roziman. AI ortiqcha yuklangan o'qituvchini **aniqlaydi**, lekin qayta taqsimlashni **tavsiya qilmaydi** |
| ~~**"Qaysi kurs eng foydali?"**~~ | ✅ **v1 ga kiritildi** — `Course` modeli Faza 1 da qo'shiladi |
| **Bonus miqdorini avtomatik hisoblash** | AI ko'rsatkich beradi, **miqdorni owner belgilaydi**. Avtomatlashtirish — huquqiy va ishonch xavfi |
| **Uy vazifasi tahlili** | Model yo'q |

---

## 12. Muhandislik konvensiyalari (mavjud kodga mos)

**Backend** — `server/CLAUDE.md` qoidalari:
```
modules/ai/
├─ handlers/          # har bir endpoint — alohida fayl
├─ services/          # biznes mantiq, DB ga to'g'ridan-to'g'ri kirishi mumkin
├─ signals/           # sof aggregation funksiyalari
├─ scoring/           # vaznli modellar (sof funksiya, test qilinadigan)
├─ llm/               # Anthropic client, prompt shablonlar, tool registri
├─ validators/        # zod
└─ ai.routes.js
```

- Har bir aggregate **`branchMatchStage()` yoki `branchGroupMatchStage()` bilan
  boshlanishi SHART** — bu kodbazadagi eng muhim xavfsizlik qoidasi
- Yangi permission kalitlari: `ai.read`, `ai.assistant`, `ai.config`
- Yangi jobs: `aiNightlyRecompute.job.js`, `aiMorningDigest.job.js`
- Xabarlar o'zbekcha, kod inglizcha

**Frontend** — `client/CLAUDE.md` qoidalari:
```
shared/components/ai/     # AiInsightCard, AiRiskBadge, AiForecastWidget, AiActionList
owner/features/ai/        # api/, hooks/, components/, pages/, index.js
```
- `qk` registriga AI kalitlari qo'shiladi (o'zboshimchalik bilan emas)
- 1 dan ortiq state → `useObjectState`
- UI matni o'zbekcha, Apple-uslubidagi toza kartalar

---

## 13. Uchta modelning hissasi

**Claude (kodbaza tahlili):**
`Group` da kurs/yo'nalish maydoni **yo'q** — bu "kurs foydaliligi" va "yana IELTS
guruh oching" funksiyalarini bugun imkonsiz qiladi. `GroupMembership.leftReasonDetail`
da tayyor churn labellari bor — backtest qilish mumkin. `branchContext.helper.js`
qoidasi (har aggregate `branchMatchStage()` bilan boshlanadi) AI qatlamiga ham
majburiy tarzda ko'chirilishi kerak, aks holda cross-branch sizish. Model narxlari
va Batches/caching hisob-kitobi tekshirilgan.

**Gemini 3 Pro:**
"AI Theater" xavfini nomladi va "Show Your Work" havolasini majburiy qoida sifatida
taklif qildi — `sourceRefs[]` shundan. IELTS bashoratini "impossible" deb aniq rad
etdi va **"Estimated Readiness"** nomlashni taklif qildi. Ishonch formulasini
(dataDensity × recency) va kogortli daromad roll-forward'ini berdi. O'qituvchi
yuklamasini qayta taqsimlashni v1 dan olib tashlashni tavsiya qildi.

**ChatGPT:** mavjud emas (`codex` CLI o'rnatilmagan, `.env` da `OPENAI_API_KEY` yo'q).

---

## 14. Qabul qilingan qarorlar

| Savol | Qaror |
|---|---|
| `Course` modeli qachon? | **Faza 1 ga ko'chirildi** — kurs foydaliligi v1 da bo'ladi |
| Narrator LLM? | **Gemini** (`@google/genai`). Narrator → `gemini-2.5-flash` + Batch; assistent/xulosa → `gemini-3.1-pro-preview` |

**Ochiq qolgan:** backtest uchun nechta oylik tarixiy ma'lumot bor?
(`GroupMembership` dagi eng eski `leftAt` ni tekshirish kerak — backtest skripti
buni o'zi hisoblab, yetarli emas bo'lsa ogohlantiradi.)

## 15. Faza 1 — BAJARILDI

| # | Ish | Fayl |
|---|---|---|
| 1 | Course modeli | `models/course.model.js`, `Group.courseId` |
| 2 | Course migratsiyasi | `seeds/migrateCourses.seed.js` — `npm run migrate:courses` |
| 3 | Insight modeli | `models/insight.model.js` (dedup, sourceRefs, outcome) |
| 4 | AiConfig modeli | `models/aiConfig.model.js` (vaznlar, chegaralar) |
| 5 | Signals qatlami | `modules/ai/signals/student.signal.js` (7 signal, bulk) |
| 6 | Churn scoring | `modules/ai/scoring/churn.scoring.js` |
| 7 | Payment scoring | `modules/ai/scoring/payment.scoring.js` |
| 8 | Deterministik narrator | `modules/ai/services/narration.service.js` |
| 9 | Insight qurish | `modules/ai/services/studentInsight.service.js` |
| 10 | Config yechimi | `modules/ai/services/aiConfig.service.js` (filial→global→kod) |
| 11 | O'qish + holat | `modules/ai/services/insight.service.js` |
| 12 | HTTP qatlami | `modules/ai/{handlers,validators,ai.routes.js}` → `/api/ai/*` |
| 13 | Tungi job | `jobs/aiNightlyRecompute.job.js` — har kuni 01:00 |
| 14 | Backtest | `seeds/aiChurnBacktest.seed.js` — `npm run ai:backtest` |
| 15 | Ruxsatlar | `ai.read`, `ai.assistant`, `ai.config`, `courses.*` |
| 16 | Frontend | `shared/components/ai/`, `owner/features/ai/`, `/owner/ai` |

**Tekshirildi:** barcha importlar hal bo'ladi, frontend build o'tadi,
scoring matematikasi sintetik holatlarda to'g'ri ishlaydi
(yuqori xavf → 0.86 / toza → 0.08 / yangi o'quvchi → ishonch 0.04 va
filtrlanadi / to'lovchi-lekin-qatnashuvchi → churn past + payment yuqori).

### Ishga tushirish tartibi

```bash
cd server
npm run seed:permissions   # ai.* va courses.* ruxsatlarini yozadi
npm run migrate:courses    # Course katalogi + guruhlarni bog'lash
npm run ai:backtest        # vaznlarni tarixga qarshi tekshirish
npm run dev                # tungi job 01:00 da o'zi ishlaydi
```

`POST /api/ai/recompute` — tungi jobni kutmasdan darhol hisoblash.

### Faza 1 da ATAYLAB YO'Q

- **LLM chaqiruvi yo'q.** `narrationEnabled: false` — matn shablondan
  chiqadi. Sabab: deterministik qatlam o'zi qiymat bermasa, LLM uni
  qutqarmaydi. Gemini integratsiyasi Faza 3 da, `narration.service.js`
  chiqishini almashtiradi (kirish `factors[]` o'zgarmaydi, shuning uchun
  LLM ishlamay qolsa tizim shablonga qaytadi).
- **Kurs foydaliligi hisoboti hali yo'q** — `Course` modeli va bog'lanish
  tayyor, hisobot Faza 2 da (moliya bo'limi bilan birga).

## 16. Ma'lum cheklovlar (halol ro'yxat)

| Cheklov | Ta'siri | Yechim |
|---|---|---|
| `StudentPayment` joyida o'zgaradi | Backtest'da qarz signali kelajakni qisman ko'radi (leakage) | Backtest **ikki** natija beradi: qarz bilan (optimistik) va qarzsiz (ishonchli). Qaror uchun ikkinchisiga qarang |
| Guruh churn signali filialdagi barcha guruhlarni oladi | Juda kichik guruhlarda shovqinli | `total < 5` uchun vazn kamaytirilishi kerak (Faza 2) |
| `Insight.narration` shablonli | Matn quruq | Faza 3: Gemini |
| Sovuq start vaznlari qo'lda | Kalibrlanmagan bo'lishi mumkin | `npm run ai:backtest` — AUC < 0.6 bo'lsa vaznlarni tuzatish shart |
