# server/ — arxitektura qoidalari

Feature-based NestJS. **Feature o'ziga tegishli hamma narsaga egalik qiladi**:
`modules/<x>/` ichida `x.module.ts`, `x.controller.ts`, `x.service.ts`,
`x.validators.ts` (zod) va shu feature'ga xos yordamchilar.

## Qoidalar (mashina tekshiradi)

| # | Qoida | Kim tekshiradi |
|---|---|---|
| R1 | `modules/A` `modules/B` ga faqat `B/index.ts` yoki `B/B.module.ts` orqali kiradi. B ning servis/helper fayliga to'g'ridan-to'g'ri import — **chuqur import**. | `scripts/arch-scan.mjs` → `test/architecture.test.mjs` |
| R2 | Boshqa modulning `*.validators.ts` fayli import qilinmaydi. DTO o'z modulida. | ESLint `no-restricted-imports` + skaner |
| R3 | `common/**` `modules/**` dan import qilmaydi. | ESLint + skaner |
| R4 | Modul darajasida sikl yo'q. | skaner + `depcruise` |
| R5 | `common/` ichidagi domenga xos kod — hisobot (`npm run arch:map`), xato emas. | skaner |

`src/dto/`, `src/validators/` kabi global papkalar **yaratilmaydi**.

## Baseline — qarz o'smaydi

`test/architecture.baseline.json` — bugungi buzilishlar ro'yxati. CI (`security.yml`)
`npm run test:architecture` bilan **yangi** buzilishni qizil qiladi; eskilari o'tadi.

- Buzilishni tuzatdingiz → `npm run arch:baseline` (ro'yxat qisqaradi).
- Yangi buzilish kiritdingiz → skript **rad etadi**; baseline'ga qo'lda yozmang.

## Holat

| Qoida | Boshlang'ich | Hozir |
|---|---|---|
| R1 chuqur import | 106 | **0** |
| R2 begona validator | 3 | **0** |
| R3 `common` → `modules` | 1 | **0** |
| R4 modul sikli | 7 | 7 |

R1–R3 endi **ESLint darajasida** (`error`) — yozayotgan paytda ko'rinadi.
Baseline'da faqat 7 ta sikl qoldi.

### Modul sirti: `index.ts`

Har modulda `index.ts` — uning **ommaviy API'si**. Boshqa modullar faqat
shu fayldan (yoki `<mod>.module.ts` dan) import qiladi.

⚠ **Modul klassi barrel'ga QO'SHILMAYDI.** U yerda bo'lsa, servisni olish
uchun `*.module.ts` ham yuklanadi va ESM baholashda sikl chiqadi
(`Cannot access 'XModule' before initialization` — bu aynan sodir
bo'lgan). Modul klassi doim `../<mod>/<mod>.module.js` dan olinadi.

### Qolgan 7 ta sikl

`finance ↔ teacher-salary ↔ groups ↔ deposits ↔ opening-balance` va
`finance ↔ student-freeze`. Ular **modul darajasida** va Nest ularni
`forwardRef` bilan ushlab turibdi. Uzish uchun umumiy qismni uchinchi
modulga chiqarish yoki bog'liqlikni interfeys orqali teskari qilish
kerak — bu alohida ish, chunki moliya oqimlariga tegadi.

### Bajarilmagan: `students/` moduli

Student endpointlari 12 modulga tarqalgan va alohida `students/` moduli
yo'q (student = `roleType` bilan `User`). Chegara o'rnatish rejasi:

1. `users.service.ts` (1613 qator) dan student domeniga oid qismni
   ajratish — **profil/identifikatsiya**, moliya yoki davomat emas.
2. `students/index.ts` bilan sirt belgilash; `users` unga delegatsiya
   qiladi, endpointlar **o'z manzilida qoladi** (mijoz buzilmasin).
3. Keyingi bosqichda `/students/*` manzillari qo'shilib, eskilari
   yo'naltiriladi.

Bu ish tirik baza bilan tekshirishni talab qiladi, shuning uchun
alohida bosqichga qoldirildi.

## Buzilishni qanday tuzatish

1. **Chuqur import (R1)** — B moduliga `index.ts` yarating va kerakli servis/sxemani
   undan eksport qiling (`modules/opening-balance/index.ts` namuna). Iste'molchi
   `../b/index.js` dan oladi.
2. **Begona validator (R2)** — sxema kimniki? Domenga xos bo'lsa → egasining `index.ts`
   orqali; umumiy qoida bo'lsa (sana, pul, ObjectId) → `common/utils/*-schemas.ts`
   (`common/utils/date-schemas.ts` namuna).
3. **`common` → `modules` (R3)** — `common`dagi kod aslida kimga kerak? Bitta
   funksiyani `common/utils` ga ko'chirish yetarli bo'lishi mumkin (`format-bytes.ts`
   namuna).
4. **Sikl (R4)** — ikkala tomon bir-birini chaqirsa, biri orkestrator bo'lishi kerak:
   umumiy qismni uchinchi modulga chiqaring yoki bog'liqlikni interfeys orqali teskari
   qiling.

## Buyruqlar

```
npm run lint                # ESLint (chegara qoidalari — error, uslub — warn)
npm run arch:map            # bog'liqlik xaritasi + common sizishi nomzodlari
npm run arch:map:verbose    # + har bir chuqur import
npm run test:architecture   # CI darvozasi
npm run arch:baseline       # qarz kamayganda ro'yxatni qisqartirish
npm run arch:cruise         # dependency-cruiser (ikkinchi fikr, baseline'siz)
```
