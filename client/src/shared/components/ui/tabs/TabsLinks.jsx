// Router
import { NavLink, useLocation } from "react-router-dom";

// Utils
import { cn } from "@/shared/utils/cn";

// Mirrors shadcn TabsList/TabsTrigger classes so styling stays identical
const LIST_CLASS =
  "inline-flex h-10 items-center justify-center rounded-sm bg-white p-1 text-muted-foreground border";

const TRIGGER_CLASS =
  "inline-flex items-center justify-center whitespace-nowrap rounded-[2px] px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

const TRIGGER_ACTIVE_CLASS = "bg-primary text-white shadow-sm";

const TabsLinks = ({
  items = [],
  className = "",
  itemClassName = "",
  activeClassName = "",
  end = true,
}) => {
  if (!items.length) return null;
  const { pathname } = useLocation();

  return (
    <nav role="tablist" className={cn(LIST_CLASS, className)}>
      {items.map((item) => {
        const isActive =
          item.exact === false
            ? pathname.startsWith(item.to)
            : pathname === item.to;

        return (
          <NavLink
            to={item.to}
            key={item.to}
            end={item.exact ?? end}
            aria-disabled={item.disabled || undefined}
            data-state={isActive ? "active" : "inactive"}
            className={cn(
              TRIGGER_CLASS,
              itemClassName,
              isActive && TRIGGER_ACTIVE_CLASS,
              isActive && activeClassName,
              item.disabled && "pointer-events-none opacity-50",
            )}
          >
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
};

export default TabsLinks;
