# `server/docs/` — Express davridan ko'chirilgan hujjatlar

Bu fayllar `server_legacy/` (Express stek) papkasidan ko'chirildi.
Papkaning o'zi **2026-08-25 da o'chirildi** — u faqat testlar uchun
solishtiruv manbasi bo'lib qolgan edi va o'sha rol muzlatilgan
oracle fiksturalariga (`server/test/fixtures/express-*.json`)
o'tkazildi.

| Fayl | Nima haqida | Bugungi holati |
|---|---|---|
| `FINANCE-ARCHITECTURE.md` | Moliya moduli arxitekturasi (jurnal, kassa, maosh) | ⚠ Domen o'zgarmagan holda ko'chirilgan — **hamon tegishli** |
| `NESTJS-MIGRATION-AUDIT.md` | Ko'chirishdan oldingi to'liq audit (Phase 0) | Tarixiy |
| `MIGRATION.md` | MongoDB → PostgreSQL/Prisma ko'chirishi | Tarixiy |
| `PHASE2-AUTH-RBAC-AUDIT.md` | Auth / rol / ruxsat auditi | ⚠ RBAC modeli o'zgarmagan — **qisman tegishli** |
| `HANDOFF-PROMPT.md` | Mongo→Postgres ishini tugatish topshirig'i | Tarixiy |
| `CLAUDE.md` | Express backend tuzilmasi bo'yicha qo'llanma | ⚠ **ESKIRGAN** — Express tuzilmasini tasvirlaydi, NestJS'ni EMAS |

⚠ `CLAUDE.md` ATAYLAB `server/` ILDIZIGA QO'YILMADI: u yerda Claude Code
uni loyiha ko'rsatmasi sifatida avtomatik yuklaydi va **Express
tuzilmasini NestJS'niki deb** o'qirdi. Hozirgi holat uchun
`server/MIGRATION-CHECKLIST.md` ga qarang.
