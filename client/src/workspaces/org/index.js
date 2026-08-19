/**
 * TASHKILOT ISH MAKONI — PUBLIC API.
 *
 * Ilgari bu yerda `admin/` qobig'i bor edi: sidebarsiz, o'z
 * navigatsiyasi va o'z sarlavhasi bilan ikkinchi ilova. U «rol emas,
 * qarash nuqtasi» deb izohlangan edi va o'sha paytda bu to'g'ri
 * yechim edi — chunki qobiq ROLGA bog'langandi va boshqa qarash uchun
 * ikkinchisini qurishdan boshqa yo'l yo'q edi.
 *
 * Endi qobiq ISH MAKONIGA bog'langan va makon ruxsatlardan
 * hisoblanadi. Ya'ni «boshqa qarash» — bu shunchaki boshqa makon,
 * ikkinchi ilova emas. Barcha kesimlar shu makon ichida, bitta
 * sidebar bilan.
 */
export { DRILLDOWN, userHref, groupHref, branchHref } from "./navigation/drilldown";
