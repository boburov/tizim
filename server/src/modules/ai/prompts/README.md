# LLM promptlari

Bu papkadagi har bir fayl bitta **prompt quruvchi** (`buildPrompt`) va uning
**javob sxemasi** (`SCHEMA`) ni eksport qiladi.

## Chegara (buzilmaydigan qoida)

```
signals → scoring → RAQAMLAR → [LLM] → SO'ZLAR / TASNIF
                      ▲                    │
          raqam SHU YERDA hisoblanadi      └── LLM raqam CHIQARMAYDI
```

`gemini.service.js` da o'rnatilgan chegara shu papkada ham amal qiladi:

| LLM QILADI | LLM QILMAYDI |
|---|---|
| Erkin matnni tasniflash | Ball/foiz hisoblash |
| Mavzularni guruhlash | Xavf darajasini o'lchash |
| Tayyor raqamni gapga aylantirish | Yangi raqam o'ylab topish |
| Sababni matndan topish | Bazadan ma'lumot "eslash" |

**Nega:** raqam LLM dan chiqsa, uni tekshirib bo'lmaydi va bir xil ma'lumot
ikki xil natija berardi. Owner bir marta noto'g'ri raqam ko'rsa, butun
tizimga ishonishni to'xtatadi.

## Har bir promptda majburiy bo'lgan 4 qoida

1. **FAQAT JSON** qaytariladi (markdown bloki, izoh, muqaddima yo'q).
2. **Berilgan ma'lumotdan tashqariga chiqilmaydi** - kirishda yo'q narsa
   javobda ham bo'lmaydi.
3. **Ishonch yetmasa `"unknown"`** - taxmin qilinmaydi. Noto'g'ri tasnif
   bo'sh tasnifdan YOMONROQ: u qaror qabul qilishga asos bo'lib qoladi.
4. **Odam ismi faqat kirishda berilgan bo'lsa** ishlatiladi (anonim
   feedback'da ism umuman bo'lmaydi).

## Fayllar

| Fayl | Kirish | Chiqish |
|---|---|---|
| `feedbackClassify.prompt.js` | bitta feedback matni | tasnif + shoshilinchlik |
| `feedbackThemes.prompt.js` | N ta tasniflangan feedback | takrorlanuvchi mavzular |
| `leadLoss.prompt.js` | lid izohlari + tarix | yo'qotish sababi |
| `funnelDiagnosis.prompt.js` | tayyor voronka raqamlari | diagnoz + harakat |
| `teacherReview.prompt.js` | tayyor o'qituvchi ko'rsatkichlari | sintez + maslahat |
