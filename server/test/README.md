# TESTLAR — CUTOVER'DAN KEYINGI HOLAT (2026-08-22)

## ⚠ ENG MUHIMI: PARITET TESTLARI ENDI ISHLAMAYDI

Ular **IKKI stekni** talab qiladi: Express (`:5000`) va NestJS (`:5001`).
Cutover'da Express to'xtatildi va NestJS `:5000` ni egalladi — ya'ni
solishtiradigan ikkinchi tomon **YO'Q**.

**Ularni ishga tushirish ma'nosiz** va natija chalg'ituvchi bo'ladi
("stek javob bermadi"). Ular **TARIXIY DALIL** sifatida saqlanadi.

### Oxirgi to'liq yurish (ikkala stek tirik bo'lgan holat)

| | |
|---|---|
| To'plam | **66** |
| Tekshiruv | **3585+** |
| Yiqildi | **0** |
| O'lchanmadi | **0** |

Shu yurishda 5 ta O'LCHOV nuqsoni topilgan va tuzatilgan (to'rtta to'plam
"ko'chirilmaganlik" ni invariant qilib yozgan, bittasi xavfsizlik
tekshiruvini seed holatiga bog'lagan) — batafsil `MIGRATION-CHECKLIST.md`.

---

## HOZIR ISHLAYDIGAN TEKSHIRUVLAR (yagona stek)

| Buyruq | Nimani o'lchaydi |
|---|---|
| `npm run smoke` | 18 ta asosiy marshrut javob beryaptimi |
| `npm run test:db-invariants` | 23 ta baza invarianti (jurnal muvozanati, manfiy balans, ortiqcha to'lov, yetim qator, kvota drifti) |
| `node --env-file=.env test/fixture-residue.test.mjs` | bazada sinov qoldig'i yo'qmi |
| `node --env-file=.env test/jobs-infra.test.mjs` | 25/25 cron, `lockLifetime`, vaqt zonasi, **navbat EGALIGI** |
| `node --env-file=.env test/module-registration.test.mjs` | 60/60 modul, 52/52 kontroller (manba = qurilma) |
| `node --env-file=.env test/schedule-jobs.test.mjs` | rejalashtiruvchi shartnomasi |
| `node --env-file=.env test/notification-jobs.test.mjs` | bildirishnoma joblari |
| `node --env-file=.env test/prisma-smoke.test.mjs` | Prisma kengaytmalari (Decimal, `passwordHash` yashirish, jurnal o'zgarmasligi) |
| `npm run test:seed-bootstrap` | **TOZA bazani bootstrap qilish** — alohida baza yaratadi, migratsiya yotqizadi, seed yurgizadi, natijani kod konstantalari bilan solishtiradi va idempotentlikni o'lchaydi (20 tekshiruv) |
| `npm run test:constants` | konstantalar pariteti — endi `PERMISSION_LABELS` va ruxsat KO'LAMI (owner-only / filial-ichi) ham (21 tekshiruv) |
| `npm run test:branch-intent` | yozuv noto'g'ri filialga tushmasligi — `x-branch-context` 409 to'sig'i (14, bazasiz) |
| `npm run test:salary-rate` | oy o'rtasida stavka o'zgarganda pul bo'linishi + legacy yozuvlar o'zgarmasligi (57, bazasiz) |
| `npm run test:resource-scope` | har bir model filial ko'lami bo'yicha reyestrdan o'tganmi (84/84, bazasiz) |
| `npm run test:bot-auth` | bot-auth ISHLAYDI — token `sub` haqiqiy; manfiy nazorat (buzuq HMAC → 401) va o'lchangan tozalash (9) |
| `npm run test:owner-decisions` | B4/B9/B13/B17 — ega qarorlari qulflandi. ESKI qurilmaga qarshi yurgizilganda **8 tekshiruv qizil** bo'ladi (18) |
| `npm run test:absence-alert` | B16 — ketma-ket yo'qlik ogohlantirishi ISHLAYDI; ostonagacha xabar yo'qligi ham o'lchanadi (6) |

## SEED — TOZA O'RNATMA

Cutover'da `src/seeds/` ko'chirilmay qolgan edi (u na marshrut, na modul —
ko'chirish uni ko'rmagan). Endi u NestJS tomonida:

```
npm run seed:bootstrap            # build + ruxsatlar + owner + ma'lumotnomalar
npm run migrate:director-full     # direktor rolini ko'lamga qaytaradi
npm run migrate:journal-backfill -- --dry   # jurnal bo'shliqlarini SANAYDI
```

Batafsil (nimasi ko'chirildi, nimasi yo'q va NEGA, qanday o'lchangan):
`MIGRATION-CHECKLIST.md` §7.

## ⚠ `jobs-infra` DAGI QOIDA TESKARISIGA AYLANDI

Kesishuv davrida u "NestJS navbatga TEGMASIN" ni talab qilardi.
Cutover'dan keyin qoida teskari: **NestJS YAGONA ega bo'lishi SHART**.

Himoya yo'qolmadi, faqat yo'nalishi o'zgardi:
- ilgari — "ikkinchi ega paydo bo'lmasin"
- endi — "ega BOR va U BITTA" (5001 bo'sh ekani ham o'lchanadi)

## ESKI EXPRESS MANBAI

Ba'zi paritet testlari `../../server_legacy/src/...` dan import qiladi —
u ko'chirishda ETALON bo'lgan. `server_legacy/` papkasi shu sababdan
o'chirilmadi.
