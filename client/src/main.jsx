// Styles
import "animate.css";
import "./styles/scrollbars.css";
import "./styles/index.css";

// Tema ranglarini .env dan qo'llash
import { applyAppTheme } from "@/shared/constants/app";
applyAppTheme();

// Toaster
import { Toaster } from "sonner";

// Routes
import Routes from "@/app/routes.jsx";

// Error boundary
import ErrorBoundary from "@/shared/components/ErrorBoundary";

// Store (Redux)
import store from "@/app/store";
import { Provider } from "react-redux";

// React
import { createRoot } from "react-dom/client";

// Router
import { BrowserRouter } from "react-router-dom";

// TanStack Query
import queryClient from "@/app/query-client";
import { QueryClientProvider } from "@tanstack/react-query";

// Telegram Mini App ichida ochilganda - qaysi URL bo'lsa ham (ildiz/login) - bog'lash
// sahifasiga (/bot-auth) majburan yo'naltiramiz. Aks holda Telegram ildizni ochib,
// oddiy /login ishlaydi va initData yuborilmaydi (Telegram ID bog'lanmaydi).
const _tg =
  typeof window !== "undefined" ? window.Telegram?.WebApp : null;
const _inTelegram =
  (_tg && _tg.initData) ||
  (typeof window !== "undefined" &&
    window.location.hash.includes("tgWebApp"));
if (
  _inTelegram &&
  typeof window !== "undefined" &&
  window.location.pathname !== "/bot-auth"
) {
  window.history.replaceState(
    null,
    "",
    "/bot-auth" + window.location.search + window.location.hash,
  );
}

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <Provider store={store}>
          <Routes />

          <Toaster
            richColors
            position="top-right"
            offset={{ top: 24 }}
            mobileOffset={{ top: 24 }}
          />
        </Provider>
      </QueryClientProvider>
    </BrowserRouter>
  </ErrorBoundary>,
);
