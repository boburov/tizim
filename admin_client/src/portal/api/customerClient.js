import axios from 'axios';

const baseURL = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:4000/api';

/**
 * Mijoz (self-service) API klienti.
 *
 * Nega alohida instance: super admin klienti 401 bo'lganda `/auth/refresh`
 * ga boradi, mijozniki esa `/customer/auth/refresh` ga. Bitta instance'da
 * ikkalasini aralashtirish noto'g'ri endpoint chaqirilishiga olib kelardi.
 * Cookie nomlari ham serverda alohida (customer_access_token), shuning uchun
 * bir brauzerda ikkala sessiya ziddiyatsiz yashaydi.
 */
export const customerApi = axios.create({
  baseURL,
  withCredentials: true,
});

let refreshing = null;

customerApi.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    // Auth marshrutlarining o'zida refresh urinmaymiz - cheksiz sikl bo'lardi.
    const isAuthCall = original?.url?.includes('/customer/auth/');

    if (status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        refreshing = refreshing || customerApi.post('/customer/auth/refresh');
        await refreshing;
        refreshing = null;
        return customerApi(original);
      } catch (e) {
        refreshing = null;
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  },
);

/** Google orqali kirish - to'liq sahifa redirect (popup emas). */
export const googleLoginUrl = () => `${baseURL}/customer/auth/google`;
