# API xizmatlar: serverga qo'shish va so'rovlarni hisoblash

Bu hujjat ikki savolga javob beradi:

1. Localdagi API xizmatlarni **serverdagi panelga** qanday chiqarish;
2. Har bir so'rov **haqiqatan** qanday hisoblanishi.

---

## 1. Nega localdagi xizmat serverda ko'rinmaydi

API xizmatlar kodda emas, **bazada** yashaydi. Local mashinada va serverda
ikkita boshqa-boshqa PostgreSQL bazasi bor:

```
local:   admin_server/.env → DATABASE_URL=postgresql://…@localhost/admin_local
server:  /root/admin/.env  → DATABASE_URL=postgresql://…@localhost/admin_prod
```

Kod `git push` bilan ko'chadi, baza yozuvlari esa **ko'chmaydi**. Shuning uchun
localda yaratgan `edu-pronauns` xizmati serverda o'z-o'zidan paydo bo'lmaydi.

Uni serverga chiqarishning uchta yo'li bor.

### A) Paneldan qo'shish (tavsiya etiladi)

Eng sodda yo'l — SSH umuman kerak emas:

1. serverdagi panelga super admin sifatida kiring;
2. **API xizmatlar → Yangi xizmat** — `key`, nom, manzil kiritiladi;
3. xizmat sahifasida **Yangi tarif** — slot, tezlik, ustuvorlik, kvota;
4. **Yangi obuna** — mijoz va tarif tanlanadi, API kalit shu yerda bir marta
   ko'rsatiladi.

`key` local bilan **bir xil** bo'lishi kerak (`edu-pronauns`), chunki xizmatning
o'zi ba'zan shu kalit bo'yicha o'zini taniydi.

> Kalit (`pk_…`) bazada faqat sha256 hash ko'rinishida saqlanadi. Ya'ni
> localdagi kalitni serverga "ko'chirib" bo'lmaydi — serverda **yangi kalit**
> olinadi va xizmatning `.env` iga o'sha yoziladi.

### B) Seed skript bilan (bir marta, ommaviy)

Xizmat + 3 tarif + o'z obunamiz birdaniga kerak bo'lsa:

```bash
ssh root@<server>
cd /root/admin          # admin_server papkasi
git pull
npm ci --omit=dev
npx prisma migrate deploy
npm run seed:api        # xizmat, tariflar, obuna va BIRINCHI KALIT
pm2 restart admin-api
```

`seed:api` **idempotent**: qayta ishga tushirilsa mavjud yozuvlarni yangilaydi,
obuna allaqachon bo'lsa tegmaydi. Kalit esa faqat birinchi martada chiqadi —
konsoldan nusxa oling, keyin uni hech kim ko'ra olmaydi.

Yangi xizmat qo'shish uchun `prisma/seedApiServices.js` dagi `SERVICE` va
`TIERS` ni o'zgartirib, skriptni qayta ishga tushirasiz.

### C) Localdan eksport (kerak bo'lsa)

Ko'p xizmat va tarif yig'ilib qolgan bo'lsa, localdagi yozuvlarni SQL bilan
ko'chirish mumkin:

```bash
# localda
pg_dump "$DATABASE_URL" --data-only \
  -t '"ApiService"' -t '"ApiTier"' > api-services.sql

# serverda (kalitlar va obunalar KO'CHIRILMAYDI — ular mijozga bog'liq)
psql "$DATABASE_URL" < api-services.sql
```

Odatda A yoki B yetarli; bu yo'l faqat o'nlab xizmat bo'lganda mantiqli.

---

## 2. So'rovlar qanday hisoblanadi

### Nega admin server so'rov yo'lida turmaydi

`admin_server` — **control plane**: kim, qaysi tarifda, qachongacha. Xizmatning
o'zi (python) — **data plane**: so'rovni bajaradi va limitni majburlaydi.

Agar har bir so'rov admin serverdan o'tsa, admin server o'chgan zahoti butun
xizmat o'chardi va har so'rovga qo'shimcha kechikish qo'shilardi. Shuning uchun
hisob **xizmat tomonida** yig'iladi va admin serverga yuboriladi.

### Integratsiya: uchta chaqiruv

Hammasi `x-gateway-secret` sarlavhasi bilan himoyalangan
(`admin_server/.env` dagi `GATEWAY_SECRET`).

**1) Kalitni tekshirish** — har so'rovda emas, kalit uchun ~60 soniyada bir
marta (javob keshlanadi):

```http
POST /api/api-gateway/authorize
{ "key": "pk_a1b2c3d4.<sir>" }
```

```json
{
  "allowed": true,
  "subscriptionId": "clx…",
  "tier": { "concurrency": 2, "rateLimitRpm": 120, "priority": 2, "monthlyQuota": -1 },
  "quotaUsed": 1840,
  "periodStart": "2026-08-01T00:00:00.000Z",
  "expiresAt": "2027-08-01T00:00:00.000Z"
}
```

Rad etilganda ham javob `200` bo'ladi: `{"allowed": false, "reason": "subscription_expired"}`.
`reason` ga qarab xizmat o'z HTTP statusini tanlaydi (402/403/429).

**2) Hisobni yuborish (batch — asosiy yo'l).** Xizmat har so'rovni lokal
sanaydi va har 15 soniyada **farqni** yuboradi:

```http
POST /api/api-gateway/usage
{
  "items": [
    { "subscriptionId": "clx…", "day": "2026-08-11", "endpoint": "assess",
      "ok": 42, "rejected": 1, "failed": 0, "totalMs": 4210 }
  ]
}
```

Qiymatlar **qo'shiladi** (increment), shuning uchun batch yuborilgandan keyin
lokal buferni tozalash kerak. Yuborish muvaffaqiyatsiz bo'lsa bufer saqlanib
qoladi va keyingi urinishda katta farq bo'lib ketadi — hisob yo'qolmaydi.

**3) Bitta so'rovni hisoblash (sodda yo'l).** Batch yig'ishni xohlamasangiz:

```http
POST /api/api-gateway/meter
{ "subscriptionId": "clx…", "endpoint": "assess", "outcome": "ok", "ms": 118 }
```

`outcome`: `ok` | `rejected` | `failed`. `ms` faqat `ok` da o'rtacha vaqtga
qo'shiladi — rad etilgan so'rov latencyni buzmasligi kerak.

Bu chaqiruv **mijozga javob qaytarilgandan keyin**, kutmasdan qilinishi kerak
(`asyncio.create_task` / fire-and-forget). Aks holda hisob mijoz so'rovini
sekinlashtiradi.

> Sekundiga ~10 dan ko'p so'rov bo'lsa batch afzal: `meter` har so'rovga bitta
> DB yozuvi qiladi.

### Hisob tirikligini panelda ko'rish

Har ikkala yo'l ham obunaning `lastRequestAt` maydonini yangilaydi. Panelda:

- **API xizmatlar** ro'yxatida — "Bugun: N" va "Oxirgi so'rov: hozir ishlayapti";
- xizmat sahifasida har obuna uchun bugungi `ok` / `rejected` va aniq vaqt.

Agar 30 kunlik raqam o'sib turgan bo'lsa-yu "Oxirgi so'rov" bir necha kun oldin
bo'lsa — xizmat usage yuborishni to'xtatgan. Integratsiyani tekshiring.

### Nima hisoblanadi

| Maydon     | Ma'nosi                                              |
| ---------- | ---------------------------------------------------- |
| `ok`       | bajarilgan so'rov — kvota shundan sanaladi           |
| `rejected` | limit/muddat sababli rad etilgan (402/403/429)       |
| `failed`   | xizmat xatosi (5xx) — mijoz aybdor emas              |
| `totalMs`  | umumiy ishlov vaqti, o'rtacha latency shundan chiqadi |

Kvota **kalendar oyi bo'yicha emas**, obuna boshlangan kundan sanaladi:
15-mayda ochilgan obunaning davri 15-may — 15-iyun.
