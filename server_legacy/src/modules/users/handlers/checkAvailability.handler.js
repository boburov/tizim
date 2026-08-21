import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/users.service.js";

// LOGIN (username) BAND EMASLIGINI oldindan tekshiradi.
//
// NEGA KERAK: foydalanuvchi yaratish formasi ikki qadamli (o'qituvchida
// 2-qadam - maosh). Takrorlanish esa faqat OXIRIDA, server 409 qaytarganda
// bilinardi: odam ism, login, parol, sana va maoshni to'ldirib bo'lgach
// "bunday login mavjud" degan xabarni olardi va hamma ishni qaytadan
// qilishi kerak edi. Bu endpoint xatoni maydonning O'ZIDA, yozayotgan
// paytda ko'rsatish imkonini beradi.
//
// TELEFON tekshirilmaydi - takrorlanish ruxsat etilgan (user.model.js).
const checkAvailability = asyncHandler(async (req, res) => {
  const data = await service.checkAvailability({
    username: req.query.username,
    excludeId: req.query.excludeId,
  });
  res.json({ success: true, data });
});

export default checkAvailability;
