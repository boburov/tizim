// Theme
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Butun ilova uchun tema konteksti.
 *
 * - `defaultTheme="system"` + `enableSystem` - foydalanuvchi hech narsa
 *   tanlamagan bo'lsa, OS sozlamasiga qarab AVTOMATIK ishlaydi va OS
 *   rejimi almashsa, sahifa yangilanmasdan darhol moslashadi.
 * - `storageKey="theme"` - index.html dagi FOUC oldini oluvchi skript
 *   ham xuddi shu kalitni o'qiydi.
 */
const ThemeProvider = ({ children }) => (
  <NextThemesProvider
    attribute="class"
    defaultTheme="system"
    enableSystem
    storageKey="theme"
    disableTransitionOnChange={false}
  >
    {children}
  </NextThemesProvider>
);

export default ThemeProvider;
