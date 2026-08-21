// SUBYEKT → PROFIL HAVOLASI - bitta manba haqiqati.
//
// NEGA BACKEND'DA (frontend'da emas): bu moslashuv UCH joyda kerak -
// Insight kartasi (subjectLabel bosilganda), reyting qatori va kelajakdagi
// Telegram/hisobot matni. Frontend'da qilinsa, hisobot matnidagi havola
// boshqacha qurilardi va ikkisi jimgina ayrilib ketardi.
//
// NEGA HAVOLA UMUMAN KERAK: AI "Aziz Karimov 3 oydan beri to'lamayapti"
// desa, owner darhol "kim bu, batafsil ko'ray" deydi. Ismni qidiruvga
// qo'lda kiritish - har kuni takrorlanadigan ishqalanish, va aynan shu
// ishqalanish tufayli owner AI sahifasini ochishni to'xtatadi.

/**
 * Subyekt turi va ID bo'yicha owner panelidagi sahifa manzili.
 *
 * `course` uchun null qaytadi: kurs profili sahifasi hozircha yo'q, va
 * ishlamaydigan havola berish umuman havola bermaslikdan YOMONROQ -
 * bosilgan havola 404 ga olib borsa owner butun sahifaga ishonmay qo'yadi.
 *
 * @param {"student"|"teacher"|"group"|"lead"|"course"|"branch"} subjectType
 * @param {string|object} subjectId
 * @returns {string|null}
 */
export const subjectHref = (subjectType, subjectId) => {
  const id = subjectId ? String(subjectId) : "";
  if (!id) return null;

  switch (subjectType) {
    // O'quvchi va o'qituvchi bitta User hujjati - ikkalasi ham
    // /owner/users/:id da ochiladi (UserDetailPage rolga qarab
    // kerakli panellarni ko'rsatadi).
    case "student":
    case "teacher":
      return `/owner/users/${id}`;
    case "group":
      return `/owner/groups/${id}/o-quvchilar`;
    case "lead":
      return `/owner/leads?leadId=${id}`;
    case "branch":
      return `/owner/branches`;
    case "course":
    default:
      return null;
  }
};
