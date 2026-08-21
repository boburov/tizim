# QAROR VARAQASI — oxirgi 6 band

Har biriga **HA** yoki **YO'Q** yozing. Boshqa hech narsa kerak emas.
Keyin pastdagi promptni nusxalab agentga bering.

---

**1. B4 — `GET /notifications/stats` HAR DOIM 500 beradi.**
Ikkala stekda ham shunday edi, ya'ni bu ko'chirish nuqsoni emas.
Tuzatilsinmi (500 → 200, bo'sh statistika qaytarsin)?

> JAVOB:  HA          ← tavsiya: HA

---

**2. B13 — arxivlangan guruhda ziddiyat.**
`GET /groups/:id` → 200, lekin `GET /groups/:id/history` → 400.
Ayni guruh uchun ikki xil javob. `history` ham 200 qaytarsinmi?

> JAVOB:     HA       ← tavsiya: HA (ziddiyat aniq)

---

**3. B17 — dashboard dars kunlarini SHISHIRADI.**
`groupBreakdown` o'quvchi guruhga qachon qo'shilgani/chiqqanini
hisobga olmaydi. Tuzatilsa **dashboard raqamlari o'zgaradi** —
ya'ni siz ko'rib turgan sonlar kichrayadi (lekin to'g'ri bo'ladi).

> JAVOB:     HA       ← tavsiya: HA (hozir raqamlar noto'g'ri)

---

**4. B9 — bildirishnoma shablonlari ro'yxati tartibi.**
Ikkilamchi saralash kaliti yo'q, ya'ni bir xil sanali shablonlar
har safar boshqa tartibda chiqishi mumkin. Qo'shilsinmi?

> JAVOB:    HA        ← tavsiya: HA (kichik, xavfsiz)

---

**5. B16 — "ketma-ket kelmagan o'quvchi" bildirishnomasi O'CHIQ.**
NestJS'da to'g'ri yozilgan, lekin `EXPRESS_NOTIFICATION_IS_DEAD`
bayrog'i bilan ataylab o'chirilgan (kesishuv davrida ikki stek
ikki marta xabar yubormasligi uchun). Express endi o'lik.
YOQILSINMI?

> JAVOB:      HA lekin avval sinang      ← tavsiya: HA, lekin AVVAL sinov filialida
                       (yoqilgach egalarga xabar oqimi boshlanadi)

---

**6. B21 — jurnal backfill'i.**
Ilgari bekor qilingan to'lovlar uchun jurnal yozuvlari yo'q.
Backfill **tarixiy hisobotlarni qayta hisoblaydi** — o'tgan
oylar raqamlari o'zgaradi.

> JAVOB:      yo'q      ← tavsiya: YO'Q hozircha
                       (avval 1-5 yopilsin, bu alohida ish)

---

## AGENTGA BERADIGAN PROMPT

Yuqoridagi javoblarni to'ldirgach, quyidagini nusxalang:

```
`server/` (NestJS) — oxirgi mahsulot qarorlari yopilsin.
Kontekst: `server/MIGRATION-CHECKLIST.md` §6.2.

MENING QARORLARIM:
  B4  (notifications/stats 500):      <HA/YO'Q>
  B13 (arxivlangan guruh history):    <HA/YO'Q>
  B17 (dashboard dars kunlari):       <HA/YO'Q>
  B9  (shablon saralash tartibi):     <HA/YO'Q>
  B16 (ketma-ket yo'qlik xabari):     <HA/YO'Q>
  B21 (jurnal backfill):              <HA/YO'Q>

QOIDALAR — bu loyihada QIMMATGA TUSHGAN:

1. HOLATNI SOXTALASHTIRMANG. "Tuzatdim" deyishdan oldin ishga
   tushiring va natijani ko'rsating.

2. HAR BIR TUZATISH UCHUN TEST. Testni ATAYLAB BUZIB tekshiring:
   tuzatish olib tashlanganda test QIZIL bo'lishi O'LCHANSIN.
   Sabotaj TOZA `dist` dan qurilsin — `nest build` ni qayta
   yurgizing, aks holda eski emit YOLG'ON natija beradi.

3. ⚠ TEST QIZIL BO'LSA AVVAL SAVOL BERING: test kodni
   JAZOLAYAPTIMI yoki HAQIQIY regressiyani ko'rsatyaptimi?
   Bu loyihada testlar "ko'chirilmaganlik"ni invariant qilib
   yozgan holat OLTI marta uchradi. Yumshatmang — yo'nalishini
   teskarisiga buring va NEGA o'zgartirganingizni izohda yozing.

4. B17 va B21 RAQAMLARNI O'ZGARTIRADI. O'zgarishdan OLDIN va
   KEYIN raqamlarni yozib qo'ying va farqni ko'rsating.

5. TOZALASH O'LCHANSIN. Test bazada qator qoldirsa, uni
   to'g'ridan-to'g'ri Prisma bilan o'chiring (sinaladigan API
   orqali EMAS) va o'chirilganini ALOHIDA tekshiring.
   Fixture nomi `__probe_` yoki `__parity_` bilan boshlansin —
   aks holda `fixture-residue` uni KO'RMAYDI.

6. Ishlab turgan serverni O'ZINGIZ qayta ishga tushirmang —
   mendan so'rang.

YAKUNDA BUZILMAGAN BO'LISHI SHART:
  npm run smoke                                  # 18/18
  npm run test:db-invariants                     # 23/23
  npm run test:seed-bootstrap                    # 20/20
  npm run test:bot-auth                          # 9/9
  npm run test:constants                         # 21/21
  npm run test:resource-scope                    # 84/84 model
  node --env-file=.env test/jobs-infra.test.mjs  # 101/101
  node --env-file=.env test/module-registration.test.mjs
  node --env-file=.env test/fixture-residue.test.mjs
  node --env-file=.env test/route-matrix.mjs     # 399/399

Tugagach `MIGRATION-CHECKLIST.md` §6.2 ni yangilang.
```
