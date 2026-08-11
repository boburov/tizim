// React
import { Component } from "react";

// Components
import ErrorState from "@/shared/components/ui/feedback/ErrorState";

// Xatoni odam o'qiy oladigan qisqa matnga aylantiradi (nom + xabar + stek boshi).
const describe = (error, info) => {
  const head = [error?.name, error?.message].filter(Boolean).join(": ");
  const stack = String(error?.stack || "")
    .split("\n")
    .slice(1, 4)
    .map((line) => line.trim())
    .join("\n");
  const component = String(info?.componentStack || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");
  return [head || "Noma'lum xato", stack, component].filter(Boolean).join("\n");
};

/**
 * Render paytidagi kutilmagan JS xatosini ushlaydi - aks holda butun ilova oq
 * ekranga qulardi. Error boundary faqat class komponent bo'lishi mumkin (React).
 *
 * XATO MATNI EKRANDA KO'RSATILADI (yopiq `<details>` ichida). Ilgari u faqat
 * `console.error` ga yozilardi, bu esa Telegram mini ilovada muammoni
 * tashxislashni imkonsiz qilardi: WebView'da konsol ham, DevTools ham yo'q -
 * foydalanuvchi faqat "Nimadir noto'g'ri ketdi" ni ko'rardi va sabab
 * hech qayerdan bilinmasdi.
 */
class ErrorBoundary extends Component {
  state = { hasError: false, detail: "" };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary ushladi:", error, info);
    this.setState({ detail: describe(error, info) });
  }

  handleReset = () => {
    // Sahifani to'liq qayta yuklab toza holatdan boshlaymiz
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6">
          <ErrorState
            title="Nimadir noto'g'ri ketdi"
            message="Kutilmagan xatolik yuz berdi. Sahifani qaytadan yuklang."
            onRetry={this.handleReset}
          />

          {this.state.detail && (
            <details className="w-full max-w-md rounded-md border bg-card p-3 text-left">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Texnik ma'lumot
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                {this.state.detail}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
