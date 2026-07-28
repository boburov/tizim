// TASDIQ TALAB QILINADIGAN AMALLAR uchun javob o'rovchi.
//
// Server sozlama o'zgarishini (maosh stavkasi, chegirma, ishga olish)
// tasdiqqa yuborganda 201/200 EMAS, 202 qaytaradi va HECH NARSANI
// o'zgartirmaydi - faqat Approval hujjati yaratiladi.
//
// Shu tufayli mutation'lar:
//   - "qo'shildi" deb YOLG'ON aytmasligi kerak (xabar serverdan olinadi);
//   - ma'lumot query'larini bekor qilmasligi kerak (hech narsa o'zgarmagan) -
//     buning o'rniga tasdiqlar ro'yxati yangilanadi.
export const unwrapApproval = (r) => ({
  data: r.data?.data,
  pendingApproval: r.status === 202,
  message: r.data?.message,
});

/**
 * Muvaffaqiyat xabarini ko'rsatadi: tasdiqqa ketgan bo'lsa serverning
 * xabari (info), aks holda odatdagi muvaffaqiyat matni.
 */
export const approvalToast = (toast, res, successText) => {
  if (res?.pendingApproval) toast.info(res.message || "Tasdiqlash uchun yuborildi");
  else toast.success(successText);
};
