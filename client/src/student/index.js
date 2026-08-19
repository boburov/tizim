/**
 * ── MARSHRUT DARAXTI BU YERDA EKSPORT QILINMAYDI ──
 *
 * Ilgari bu barrel `Routes` ni ham eksport qilardi. Muammo: barrel'ni
 * BOSHQA sabab bilan import qilgan fayl (masalan `AppSidebar` —
 * qidiruv va yaratish tugmasi uchun) butun marshrut daraxtini, ya'ni
 * o'ttizdan ortiq sahifani ham tortib kelardi.
 *
 * Natijada `lazy()` ning ma'nosi qolmasdi: bo'lak allaqachon kirish
 * faylida bo'lardi. Bu jimgina buzilish edi — hech qanday xato
 * bermasdi, faqat birinchi yuklanish og'irlashardi.
 *
 * Marshrutlar `app/routes.jsx` da to'g'ridan-to'g'ri
 * `import("./routes")` bilan olinadi.
 */
