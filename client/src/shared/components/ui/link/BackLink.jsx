// Utils
import { cn } from "@/shared/utils/cn";

// Icons
import { ArrowLeft } from "lucide-react";

// Components
import { Button } from "@/shared/components/shadcn/button";

// Hooks
import useGoBack from "@/shared/hooks/useGoBack";

// `to` endi fallback: tarix bo'lsa brauzerdek orqaga qaytadi
const BackLink = ({ to = "", label = "", className = "" }) => {
  const goBack = useGoBack(to || "/");

  return (
    <Button
      type="button"
      variant="outline"
      onClick={goBack}
      className={cn(label ? "" : "size-10", className)}
    >
      <ArrowLeft className="size-4" />
      {label}
    </Button>
  );
};

export default BackLink;