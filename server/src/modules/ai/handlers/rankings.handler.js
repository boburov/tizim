import asyncHandler from "../../../middleware/asyncHandler.js";
import { getActiveBranchId } from "../../../helpers/branchContext.helper.js";
import { readAllRankings } from "../services/ranking.service.js";

// REYTINGLAR - dashboard bitta so'rovda uchtasini ham oladi.
//
// NEGA BITTA SO'ROV: uchta reyting yonma-yon turadi va ular bir xil
// tungi hisoblashdan chiqadi. Uchta alohida so'rov uch marta yuklanish
// holatini ko'rsatardi (biri kelgan, ikkitasi hali kutmoqda) va sahifa
// "yuklanayotgan panellar to'plami" bo'lib ko'rinardi.

const rankings = asyncHandler(async (req, res) => {
  const branchId = getActiveBranchId();

  // "Barcha filiallar" rejimida reyting BERILMAYDI.
  //
  // Nega: filiallar kesimida "eng ko'p kechiktirgan" ro'yxati turli
  // narxdagi, turli hududdagi o'quvchilarni bitta ustunga qo'yardi va
  // o'qituvchi reytingi butunlay ma'nosiz bo'lardi (o'qituvchi FILIAL
  // o'rtachasiga nisbatan baholanadi). Bo'sh ro'yxat o'rniga aniq sabab
  // qaytariladi - UI uni "filial tanlang" holatiga aylantiradi.
  if (!branchId) {
    return res.json({
      success: true,
      data: {
        branchRequired: true,
        payment_delay: null,
        absence: null,
        teacher: null,
      },
    });
  }

  const data = await readAllRankings(branchId);
  res.json({ success: true, data: { branchRequired: false, ...data } });
});

export default rankings;
