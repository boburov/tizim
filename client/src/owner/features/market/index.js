/**
 * MARKET FEATURE — OMMAVIY API.
 *
 * Tashqi kod FAQAT shu fayldan import qiladi. Ichki fayllar (hooks,
 * components) ichkarida qoladi — shunda ularni qayta tuzish tashqi
 * importlarni buzmaydi.
 *
 * ⚠ `MarketPage` UCH PANELDA ishlatiladi: `/owner/market`,
 * `/org/market` va o'qituvchi ko'rinishida (o'qish uchun). Nusxa
 * yaratilmadi — sabab sahifaning o'z izohida.
 */
export { default as MarketPage } from "./pages/MarketPage";

export {
  useMarketProductsQuery,
  useMarketOrdersQuery,
  useCoinStatsQuery,
  useCoinSettingsQuery,
  useUserWalletQuery,
} from "./hooks/useMarketQueries";

export {
  useCoinAdjustMutation,
  useOrderStatusMutation,
} from "./hooks/useMarketMutations";

export { default as CoinAdjustModal } from "./components/modals/CoinAdjustModal";
// O'quvchi kartasidagi "Tangalar" tabi. `users` feature'ida EMAS —
// sababi komponentning o'z izohida (`UserDepositPanel` bilan bir naqsh).
export { default as UserCoinPanel } from "./components/UserCoinPanel";
export { default as OrdersTable } from "./components/OrdersTable";
export { default as CoinEconomyCards } from "./components/CoinEconomyCards";
