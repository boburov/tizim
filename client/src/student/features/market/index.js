/** O'QUVCHI MARKETI — ommaviy API. */
export { default as MyMarketPage } from "./pages/MyMarketPage";
export { default as MyCoinsPage } from "./pages/MyCoinsPage";

export { default as CoinWalletCard } from "./components/CoinWalletCard";

// ⚠ `CoinHistoryList` va `ProductGrid` BU YERDA EMAS — ular
// `shared/components/coin/` da. Sabab: ikkalasi ham SOF KO'RINISH
// komponenti va ular o'qituvchi hamda administrator panellarida
// ham kerak. O'quvchi feature'idan eksport qilinsa, boshqa panellar
// undan import qilishga majbur bo'lardi — ya'ni "o'quvchi
// bo'limi"ga bog'liqlik paydo bo'lardi, holbuki komponentning
// o'quvchiga hech qanday aloqasi yo'q.

export {
  useMarketCatalogQuery,
  useMyOrdersQuery,
  useMyCoinsQuery,
  useMyCoinHistoryQuery,
  useCoinLeaderboardQuery,
} from "./hooks/useStudentMarketQueries";
