// React
import { Component } from "react";

// Components
import ErrorState from "@/shared/components/ui/feedback/ErrorState";

// Render paytidagi kutilmagan JS xatosini ushlaydi - aks holda butun ilova oq
// ekranga qulardi. Error boundary faqat class komponent bo'lishi mumkin (React).
class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Dev'da konsolga chiqaramiz; prod'da xohlasa monitoringga yuborish mumkin.
    console.error("ErrorBoundary ushladi:", error, info);
  }

  handleReset = () => {
    // Sahifani to'liq qayta yuklab toza holatdan boshlaymiz
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <ErrorState
            title="Nimadir noto'g'ri ketdi"
            message="Kutilmagan xatolik yuz berdi. Sahifani qaytadan yuklang."
            onRetry={this.handleReset}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
