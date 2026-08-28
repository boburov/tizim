# Filial chegarasi — loyiha (tenant) darajasida

> Savol: **"Mijoz nechta filial ocha oladi va buni kim hal qiladi?"**
> Javob bitta joyda hisoblanadi va ikki kanal orqali tenantga yetadi.

---

## 1. Nima yechildi

Ilgari filial chegarasi **umuman yo'q edi** — mijoz istagancha filial
ochardi. "Ko'p filiallimi" savoli esa ikki joyda va ikkalasi ham noto'g'ri
yashardi:

| Qayerda | Qanday edi | Muammo |
| --- | --- | --- |
| `TenantSetting.MULTI_BRANCH` | admin panelda o'chirgich | tenant ilova bu qiymatni **umuman o'qimasdi** — o'lik sozlama |
| tenant server | `branch.count() > 1` | mijoz ikkinchi filial ochib "yakka markaz" rejimini **o'zi bekor qilardi** |

Endi ikkalasi ham `Tenant` yozuvida, bitta juft bo'lib turadi.

---

## 2. Ma'lumot modeli

```
Tenant
 ├── branchesEnabled       Boolean  @default(true)   // rejim
 ├── branchLimitOverride   Int?                      // qo'lda qo'yilgan chegara (null = meros)
 ├── subscription → Plan → PlanFeature(max_branches) // tarif chegarasi
 └── addons → Addon(max_branches) × quantity         // sotib olingan paketlar
```

Ikkinchi tenant tizimi **yaratilmadi**: chegara mavjud
`Plan / PlanFeature / Addon / TenantAddon` mexanizmiga o'tirdi, ustiga
loyihaga xos ikkita ustun qo'shildi.

### Yakuniy chegara qanday hisoblanadi

`admin_server/src/branch-config/branch-config.constants.ts` →
`resolveBranchLimit()` (sof funksiya):

```
yakka markaz      →  1                      // rejimning O'ZI chegara
override          →  qo'lda qo'yilgan son
tarif             →  max_branches
standart          →  DEFAULT_BRANCH_LIMIT   // .env, standart 5
                  +  sotib olingan paketlar (addon.value × quantity)
```

⚠ **Cheksizga (`-1`) paket qo'shilmaydi** — `-1 + 5 = 4` bo'lib, cheksiz
loyihani jimgina 4 ta filialga qisib qo'yardi.

### "5" soni qayerda

**Bitta joyda**: `DEFAULT_BRANCH_LIMIT`
(`admin_server/src/branch-config/branch-config.constants.ts`), `.env`
dagi `DEFAULT_BRANCH_LIMIT` bilan bekor qilinadi.

`branchLimitOverride` qo'yilmagan loyihalar standartni **avtomatik**
oladi — standartni ko'tarish migratsiya talab qilmaydi.

Tenant serverdagi `BRANCH_LIMIT` — **standart emas, uzatilgan qiymat**;
u yerda standart `-1` (ya'ni "hech narsa aytilmagan"), aks holda ikkita
standart bir-biridan ajralib ketardi.

---

## 3. Qiymat tenantga qanday yetadi — IKKI kanal

```
Developer Admin panel
        │
        ▼
  Tenant yozuvi  ──────┬──────────────────────────────┐
                       │                              │
                       ▼                              ▼
          .env (BRANCHES_ENABLED,           heartbeat javobi
                BRANCH_LIMIT)               (max_branches,
                                             branches_enabled)
          provision/reconfigure             har 15 daqiqada
                       │                              │
                       └──────────┬───────────────────┘
                                  ▼
                 tenant server: PlanLimitsService
                                  │
                                  ▼
                    POST /branches → 402 BRANCH_LIMIT_REACHED
```

**Nega ikkalasi ham kerak.** Tarif keshi (`EntitlementsService`) ataylab
**ochiq yiqiladi**: kelmagan limit "cheksiz" deb o'qiladi, chunki bizning
tarmoq nosozligimiz to'lagan mijozni bloklab qo'ymasligi kerak. Filial
uchun bu har restartdan keyin **~15 daqiqalik ochiq eshik** bo'lardi.
`.env` shu oynani yopadi, heartbeat esa qiymatni **restartsiz**
yangilaydi.

Tanlov mantiqi: `server/src/common/entitlements/branch-limit.ts` →
`resolveEffectiveBranchConfig()`. Rejim va chegara **birga** olinadi,
aralashtirilmaydi.

---

## 4. Majburlash (server tomonida)

`server/src/modules/branches/branches.service.ts` → `create()`:

```ts
await this.planLimits.assertBranchLimit();   // nom tekshiruvidan OLDIN
```

* `createWithDirector()` ham shu metodga tushadi — ikkinchi darvoza yo'q.
* Rad etilganda: **HTTP 402**, `code: "BRANCH_LIMIT_REACHED"`,
  `details: { used, limit, remaining, branchesEnabled }`.
* ⚠ `ENFORCE_LIMITS=false` (yumshoq rejim) **bu yerda amal qilmaydi**.
  Yumshoq rejim o'z-o'zidan o'sadigan ko'rsatkichlar (o'quvchi, xodim)
  uchun; filial esa ongli ravishda ochiladi va u mahsulotning sotuv
  chegarasi.
* Frontend `/auth/me` javobidagi `branchLimits` bilan tugmani oldindan
  o'chiradi — bu **qulaylik**, himoya emas.

---

## 5. API

| Metod | Yo'l | Kim |
| --- | --- | --- |
| `GET` | `/api/tenants/:id/branch-config` | Developer Admin (o'qish) |
| `GET` | `/api/tenants/:id/branch-usage` | Developer Admin (o'qish) |
| `GET` | `/api/tenants/:id/branch-history` | Developer Admin (o'qish) |
| `PATCH` | `/api/tenants/:id/branch-config` | SUPER_ADMIN / ADMIN |
| `PATCH` | `/api/tenants/:id/branch-limit` | SUPER_ADMIN / ADMIN (`{ delta }`) |
| `POST` | `/api/tenants/:id/branch-addons` | SUPER_ADMIN / ADMIN |
| `DELETE` | `/api/tenants/:id/branch-addons/:key` | SUPER_ADMIN / ADMIN |
| `POST` | `/api/tenants` | `branchesEnabled`, `branchLimit` bilan |

`PATCH branch-config` da `branchLimit`:

* `son` — qo'lda qo'yiladi (1…1000)
* `-1` — cheksiz
* `null` — qo'lda qo'yilgani **bekor qilinadi**, tarif/standart qaytadi

---

## 6. Xavfsizlik

Uchta qo'riqchi, uchta boshqa savol
(`branch-config.controller.ts`):

```
JwtAuthGuard        — kim bu?          (token haqiqiymi)
DeveloperAdminGuard — bizning odammi?  (mijoz tokeni RAD ETILADI)
RolesGuard          — nima qila oladi? (@Roles bo'yicha)
```

O'rtadagisi ataylab alohida: keyinchalik `@Roles(...)` yozishni unutgan
yangi marshrut ham mijozga ochilmaydi.

**Mijoz o'zgartira olmaydigan narsalar** (`branchLimit`, `plan`, billing,
developer-admin konfiguratsiyasi):

* `CreateTenantDto` da `branchesEnabled`/`branchLimit` bor, lekin
  `customers.service.ts → createTenant()` ularni **kesib tashlaydi**.
  `whitelist: true` bu yerda yetarli emas — maydonlar DTO'da haqiqatan
  mavjud, ya'ni validatsiya ularni o'tkazib yuboradi.
* `customers.service.ts → myTenant()` **oq ro'yxatli `select`**:
  `deployToken`, `heartbeatSecret`, `botToken` va `branchLimitOverride`
  mijozga chiqmaydi. `include` bo'lganda `Tenant` ga qo'shilgan har qanday
  yangi ustun avtomatik oshkor bo'lardi.
* Tenant serverida chegarani **yozadigan yo'l umuman yo'q** — u faqat
  `.env` va heartbeat orqali keladi.

---

## 7. Mavjud loyihalar (migratsiya)

`20260829090000_tenant_branch_limits`:

* `branchesEnabled = true` — barcha mavjud loyihalar hozirgi rejimida qoladi;
* eski `MULTI_BRANCH=false` sozlamasi yangi ustunga **ko'chiriladi**, keyin
  `TenantSetting` dan o'chiriladi (bitta sozlama ikki joyda turmasin);
* `branchLimitOverride = NULL` — ya'ni tarif/standart amal qiladi.

⚠ Chegaradan **ortiq** filiali bor loyiha bo'lishi mumkin (masalan 8/5).
Bu ataylab tuzatilmaydi: chegara faqat **yangi** filial ochishni to'sadi
(`used >= limit`), mavjudlariga tegilmaydi. Aks holda migratsiya to'lagan
mijozning ishlab turgan filialini o'chirib qo'yardi.

---

## 8. Testlar

Ikkalasi ham **bazasiz va HTTP'siz** — sof funksiyalar:

```bash
cd admin_server && npm run test:branch-limit   # hisoblash qoidasi (30 ta)
cd server       && npm run test:branch-limit   # majburlash qoidasi (28 ta)
```

Ikkinchisi alohida muhim: u "heartbeat hali kelmagan" holatni tekshiradi —
aynan o'sha holat ochiq eshik edi.
