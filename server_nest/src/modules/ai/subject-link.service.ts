/**
 * INSIGHT SUBYEKTIDAN HAVOLA — `services/subjectLink.service.js` ning
 * KO'CHIRMASI.
 *
 * ⚠ SOF MODUL, `@Injectable` EMAS: bazaga ham, holatga ham bog'liq emas.
 * Uni servisga aylantirish DI grafigiga sababsiz tugun qo'shardi.
 */
export const subjectHref = (subjectType: any,subjectId: any) => {
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
