// Utils
import { cn } from "@/shared/utils/cn";

const Card = ({
  children,
  title = "",
  icon = null,
  className = "",
  responsive = false,
}) => {
  return (
    <div
      className={cn(
        "rounded-md border",
        responsive ? "xs:p-5 xs:bg-card" : "bg-card p-4 xs:p-5",
        className,
      )}
    >
      {title && (
        <div className="flex items-center gap-1.5 xs:gap-3.5">
          {icon && icon}
          <h2 className="font-semibold text-foreground">{title}</h2>
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;
