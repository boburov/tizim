// Icons
import {
  Info,
  OctagonX,
  CircleCheck,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";

// UI
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

const Toaster = ({ ...props }) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheck className="size-4" strokeWidth={1.5} />,
        info: <Info className="size-4" strokeWidth={1.5} />,
        warning: <TriangleAlert className="size-4" strokeWidth={1.5} />,
        error: <OctagonX className="size-4" strokeWidth={1.5} />,
        loading: (
          <LoaderCircle className="size-4 animate-spin" strokeWidth={1.5} />
        ),
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
