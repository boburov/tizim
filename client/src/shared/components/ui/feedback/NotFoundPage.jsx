// Router
import { useNavigate } from "react-router-dom";

// Icons
import { ArrowLeft, Home } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";

// Hooks
import useAuth from "@/shared/hooks/useAuth";

// Constants
import { ROLE_HOME } from "@/shared/constants/roles";

const NotFoundPage = () => {
  const navigate = useNavigate();
  const { role } = useAuth();
  const home = ROLE_HOME[role] || "/";

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-8xl font-bold tracking-tight text-foreground">
            404
          </h1>
          <h2 className="text-xl font-semibold text-foreground">
            Sahifa topilmadi
          </h2>
          <p className="text-sm text-muted-foreground">
            Siz qidirayotgan sahifa mavjud emas yoki ko'chirilgan bo'lishi
            mumkin.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            className="sm:min-w-40"
          >
            <ArrowLeft className="size-4" />
            Ortga qaytish
          </Button>
          <Button
            type="button"
            onClick={() => navigate(home, { replace: true })}
            className="sm:min-w-40"
          >
            <Home className="size-4" />
            Bosh sahifa
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
