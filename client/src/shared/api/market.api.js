// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

/** MARKET API — sof axios chaqiruvlari (`coins.api.js` dagi izohga qarang). */
export const marketAPI = {
  // ── O'quvchi ──
  catalog: (params) => http.get(ENDPOINTS.market.catalog, { params }),
  buy: (body) => http.post(ENDPOINTS.market.buy, body),
  myOrders: (params) => http.get(ENDPOINTS.market.myOrders, { params }),
  cancelOrder: (id) => http.post(ENDPOINTS.market.cancelOrder(id)),

  // ── Mahsulotlar (admin) ──
  products: (params) => http.get(ENDPOINTS.market.products, { params }),
  product: (id) => http.get(ENDPOINTS.market.productById(id)),
  createProduct: (body) => http.post(ENDPOINTS.market.products, body),
  updateProduct: (id, body) => http.patch(ENDPOINTS.market.productById(id), body),
  removeProduct: (id) => http.delete(ENDPOINTS.market.productById(id)),

  // ── Buyurtmalar (admin) ──
  orders: (params) => http.get(ENDPOINTS.market.orders, { params }),
  order: (id) => http.get(ENDPOINTS.market.orderById(id)),
  setOrderStatus: (id, body) => http.patch(ENDPOINTS.market.orderStatus(id), body),
};
