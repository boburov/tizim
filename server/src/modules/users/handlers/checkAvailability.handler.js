import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/users.service.js";

// Telefon/login BAND EMASLIGINI oldindan tekshiradi.
//
// NEGA KERAK: foydalanuvchi yaratish formasi ikki qadamli (o'qituvchida
// 2-qadam - maosh). Takrorlanish esa faqat OXIRIDA, server 409 qaytarganda
// bilinardi: odam ism, login, parol, sana va maoshni to'ldirib bo'lgach
// "bu telefon allaqachon ro'yxatdan o'tgan" degan xabarni olardi va hamma
// ishni qaytadan qilishi kerak edi. Bu endpoint xatoni maydonning O'ZIDA,
// yozayotgan paytda ko'rsatish imkonini beradi.
const checkAvailability = asyncHandler(async (req, res) => {
  const data = await service.checkAvailability({
    phone: req.query.phone,
    username: req.query.username,
    excludeId: req.query.excludeId,
  });
  res.json({ success: true, data });
});

export default checkAvailability;
