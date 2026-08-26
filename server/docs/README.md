# `server/docs/` — saqlanadigan hujjatlar

Tozalash: **2026-08-26**. Ko'chirish davridagi vaqtinchalik hujjatlar
o'chirildi (ular git tarixida qoladi). Bu papkada faqat **hozir ham
amalda bo'lgan qarorlar** turadi.

| Fayl | Nima haqida | Nega saqlanadi |
|---|---|---|
| `FINANCE-ARCHITECTURE.md` | Moliya arxitekturasi: jurnal, o'lchov ustunlari, hisoblar, ruxsat xaritasi | ⚠ **AMALDA.** §4 (nega parallel "financial transaction" jadvali EMAS), §7 (regressiya ro'yxati) va `finance.view_*` ruxsat qarori boshqa joyda yozilmagan. §3 bo'shliq jadvali — tarixiy |
| `PHASE2-AUTH-RBAC-AUDIT.md` | Auth · rol · ruxsat · filial ko'lami semantikasi | ⚠ **AMALDA** (fayl yo'llari Express davridan — moslik jadvali `MIGRATION-CHECKLIST.md` §1 da). RBAC modeli o'zgarmadi |

## O'chirilganlar (2026-08-26) va sababi

| Fayl | Nega o'chirildi |
|---|---|
| `CLAUDE.md` | Express `server/` tuzilmasini tasvirlardi. O'sha papka (`server_legacy/`) 2026-08-25 da o'chirilgan — hujjat CHALG'ITUVCHI edi |
| `MIGRATION.md` | MongoDB → PostgreSQL. 2026-08-20 da tugagan; `src/` da Mongoose yo'q, `mongoose` bog'lamasi ham yo'q |
| `NESTJS-MIGRATION-AUDIT.md` | Ko'chirishdan OLDINGI Phase 0 audit. Ko'chirish tugadi (399/399 marshrut) |
| `HANDOFF-PROMPT.md` | "Mongo→Postgres ni tugat" topshirig'i. Tugagan; unda tasvirlangan `501 MODULE_NOT_MIGRATED` shartnomasi ham o'chirilgan |
| `../WORKERS-DEPENDENCY-MATRIX.md` | Kesishuv davridagi matritsa: "6 ko'chirildi, 17 BLOKLANGAN, Express — yagona worker". Bugun `.env` da `NEST_WORKERS_ENABLED=true`, joblar 25/25 NestJS'da — hujjat TESKARI holatni yozardi |

Tiklash kerak bo'lsa: `git log --diff-filter=D -- server/docs/`

## Hozirgi holat qayerda

| Savol | Hujjat |
|---|---|
| Ko'chirish nima qildi, qaysi xatti-harakat O'ZGARDI, qanday qo'riqchilar qo'yildi | `../MIGRATION-CHECKLIST.md` (§6.1 — klientga aytilishi shart bo'lgan o'zgarishlar) |
| Qaysi testni qachon yurgizaman | `../test/README.md` |
| AI moduli: nima qurilgan, nima QURILMAGAN | `../../.claude/AI_ADVISOR_PLAN.md` §17 |
