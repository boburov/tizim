// Axios
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const http = axios.create({
  baseURL: API_URL,
  withCredentials: true, // required so the refresh httpOnly cookie is sent
  headers: { "Content-Type": "application/json" },
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("authToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, attempt one refresh and replay the original request
let isRefreshing = false;
let waiters = [];

const flushWaiters = (token) => {
  waiters.forEach((cb) => cb(token));
  waiters = [];
};

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    // Faqat login/refresh/logout refresh oqimidan istisno qilinadi. /auth/me
    // ataylab KIRADI: access token muddati tuganda (sahifa yangilashda birinchi
    // so'rov odatda shu) refresh ishlab, foydalanuvchi bekorga logout bo'lmasin.
    const url = original.url || "";
    // Bu so'rovlar refresh oqimiga KIRMAYDI:
    // - /auth/login|refresh|logout: refresh oqimining o'zi (cheksiz halqa bo'lmasin)
    // - /bot-auth/*: Telegram orqali kirish/bog'lash. Bu yerda 401 (initData HMAC
    //   o'tmadi / hisob bog'lanmagan) login formasini ko'rsatish uchun onError'ga
    //   borishi kerak - refresh urinib, /login'ga uloqtirmasin.
    const isAuthRequest = [
      "/auth/login",
      "/auth/refresh",
      "/auth/logout",
      "/bot-auth/",
    ].some((p) => url.includes(p));

    if (error.response?.status !== 401 || original._retry || isAuthRequest) {
      return Promise.reject(error);
    }

    original._retry = true;

    if (isRefreshing) {
      // Another request is already refreshing; queue and wait for the new token
      return new Promise((resolve, reject) => {
        waiters.push((newToken) => {
          if (!newToken) return reject(error);
          original.headers.Authorization = `Bearer ${newToken}`;
          resolve(http(original));
        });
      });
    }

    isRefreshing = true;
    try {
      const r = await http.post("/auth/refresh");
      const newToken = r.data?.data?.accessToken;
      if (!newToken) throw new Error("No access token in refresh response");
      localStorage.setItem("authToken", newToken);
      flushWaiters(newToken);
      original.headers.Authorization = `Bearer ${newToken}`;
      return http(original);
    } catch (e) {
      flushWaiters(null);
      localStorage.removeItem("authToken");
      // Telegram Mini App ichida /login'ga uloqtirmaymiz: u yerda initData
      // yuborilmaydi va avtomatik login oqimi buziladi. /bot-auth o'zi qayta
      // verify qilib, kerak bo'lsa login formasini ko'rsatadi.
      if (typeof window !== "undefined") {
        const tg = window.Telegram?.WebApp;
        const inTelegram =
          (tg && tg.initData) ||
          window.location.hash.includes("tgWebApp") ||
          window.location.pathname === "/bot-auth";
        if (!inTelegram) window.location.href = "/login";
      }
      return Promise.reject(e);
    } finally {
      isRefreshing = false;
    }
  },
);

export default http;
