import { useSearchParams } from "react-router-dom";

/**
 * Tab holatining QOIDASI — bitta joyda.
 *
 * ALOHIDA FAYLDA: `react-refresh` qoidasi komponent faylidan faqat
 * komponent eksport qilinishini talab qiladi. Qoida bu yerda tursa,
 * `TabNav` (chizadi) va `useActiveTab` (o'qiydi) bir xil mantiqdan
 * foydalanadi — ular ajralib ketsa, tab tugmasi bir narsani
 * ko'rsatib, ekran boshqasini chizardi.
 */
export const visibleTabs = (tabs = []) => tabs.filter((t) => t.visible !== false);

/**
 * Joriy tab kaliti.
 *
 * Noma'lum `?tab=` qiymati birinchi ko'rinadigan tabga tushadi:
 * eskirgan xatcho'q uchun bo'sh ekran juda qattiq jazo bo'lardi.
 */
export const useActiveTab = (tabs, param = "tab") => {
  const [params] = useSearchParams();
  const visible = visibleTabs(tabs);
  const raw = params.get(param);
  return visible.some((t) => t.key === raw) ? raw : visible[0]?.key;
};
