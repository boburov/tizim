// Utils
import { cn } from "@/shared/utils/cn";

// Icons
import { ArrowLeft } from "lucide-react";

// Hooks
import useGoBack from "@/shared/hooks/useGoBack";

const BackHeader = ({ className = "", fallback = "/", title = "Sarlavha" }) => {
  const goBack = useGoBack(fallback);

  return (
    <header
      className={cn(
        "flex items-center sticky inset-x-0 top-0 bg-white h-16 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-3 container">
        {/* Orqaga */}
        <button
          type="button"
          onClick={goBack}
          className="flex items-center justify-center size-10 cursor-pointer"
        >
          <ArrowLeft strokeWidth={1.5} />
        </button>

        {/* Title */}
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
    </header>
  );
};

export default BackHeader;
