import { ApiError } from '../errors/api-error.js';
import { toUtcMidnight, localTodayMidnight } from '../utils/date.js';

/**
 * `helpers/group.helper.js` NING KO'CHIRMASI.
 *
 * Tugagan (yoki o'chirilgan) kursda YOZUV amalini bloklaydi. Mavjud
 * yuklangan guruh obyektidan tekshiradi — ortiqcha so'rovsiz.
 *
 * ⚠ O'QISH yo'llarida CHAQIRILMAYDI: arxivlangan guruhni KO'RISH
 * mumkin, unga YOZISH mumkin emas.
 *
 * ⚠ `isActive` — `endDate` dan HOSILA kesh, uni kunlik job yangilaydi.
 * Shuning uchun `endDate` o'tgani ALOHIDA tekshiriladi: aks holda job
 * ishlagunicha bo'lgan oynada tugagan kursga davomat yozilib qolardi.
 */
export interface GroupState {
  isDeleted?: boolean;
  isActive?: boolean;
  endDate?: Date | string | null;
}

export const assertGroupActive = <T extends GroupState>(group: T | null | undefined): T => {
  if (!group || group.isDeleted) throw new ApiError(404, 'Guruh topilmadi');
  const ended =
    group.endDate &&
    toUtcMidnight(group.endDate).getTime() <= localTodayMidnight().getTime();
  if (!group.isActive || ended) {
    throw new ApiError(
      400,
      "Kurs tugagan. Davom ettirish uchun tugash sanasini o'zgartiring.",
    );
  }
  return group;
};
