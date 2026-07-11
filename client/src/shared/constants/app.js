// Tizim nomi .env orqali sozlanadi; logo/favicon public/ papkadan olinadi
export const APP_NAME = import.meta.env.VITE_APP_NAME || "Bayyina";
export const APP_LOGO = import.meta.env.VITE_APP_LOGO || "/logo.svg";

export const APP_THEME = {
  "--primary": import.meta.env.VITE_APP_PRIMARY,
  "--background": import.meta.env.VITE_APP_BACKGROUND,
};

export const applyAppTheme = () => {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(APP_THEME)) {
    if (value) root.style.setProperty(name, value);
  }
};
