// XLSX buferini yuklab olinadigan javob sifatida yuboradi.
//
// Bir joyda: eksport ham, import shabloni ham, xatolik hisoboti ham shu
// funksiyani ishlatadi - sarlavhalar (ayniqsa CORS expose) bir joyda
// to'g'ri bo'lsa yetarli.
export const sendXlsx = (res, buffer, fileName, extraHeaders = {}) => {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  );
  res.setHeader("Content-Length", buffer.byteLength);

  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, String(value));
  }

  // Brauzer fetch/axios bu sarlavhalarni faqat ochiq (expose) bo'lsa
  // o'qiy oladi - fayl nomi va qatorlar soni shular orqali keladi.
  res.setHeader(
    "Access-Control-Expose-Headers",
    ["Content-Disposition", "X-Export-Rows", ...Object.keys(extraHeaders)].join(", "),
  );

  res.end(Buffer.from(buffer));
};

export default sendXlsx;
