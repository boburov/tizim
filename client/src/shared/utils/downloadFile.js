// Fayl yuklab olish yordamchilari.
//
// Eksport ham, import shabloni/xatolik hisoboti ham bir xil ishlaydi:
// javob blob bo'lib keladi, fayl nomi Content-Disposition'da, xato esa
// (agar bo'lsa) o'sha blob ICHIDA JSON bo'lib keladi.

/**
 * Content-Disposition'dan fayl nomini ajratadi.
 * Server ikki variant yuboradi: filename="..." (ASCII) va
 * filename*=UTF-8''... (to'liq). Ikkinchisi ustun.
 */
export const parseFileName = (disposition, fallback = "fayl.xlsx") => {
  if (!disposition) return fallback;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      /* buzuq kodlash - ASCII variantiga tushamiz */
    }
  }
  const ascii = /filename="?([^";]+)"?/i.exec(disposition);
  return ascii?.[1] || fallback;
};

/** Blob'ni brauzerda yuklab olishga majburlaydi. */
export const saveBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Darhol revoke qilinsa Safari yuklab ulgurmaydi.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Axios javobini to'g'ridan-to'g'ri faylga saqlaydi. */
export const saveResponseAsFile = (response, fallbackName) => {
  const fileName = parseFileName(
    response.headers?.["content-disposition"],
    fallbackName,
  );
  saveBlob(response.data, fileName);
  return fileName;
};

/**
 * Xato xabarini o'qiydi.
 *
 * responseType "blob" bo'lganda xato javobi ham Blob bo'lib keladi -
 * to'g'ridan-to'g'ri o'qilsa foydalanuvchi "[object Blob]" ko'radi.
 */
export const readErrorMessage = async (error, fallback = "Xatolik yuz berdi") => {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.message) return parsed.message;
    } catch {
      /* JSON emas - umumiy xabarga tushamiz */
    }
  }
  return data?.message || error?.message || fallback;
};
