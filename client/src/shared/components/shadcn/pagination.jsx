import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { cn } from "@/shared/utils/cn";

const Pagination = ({ className, ...props }) => (
  <nav
    role="navigation"
    aria-label="pagination"
    className={cn("mx-auto flex w-full justify-center", className)}
    {...props}
  />
);
Pagination.displayName = "Pagination";

const PaginationContent = React.forwardRef(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("flex flex-row items-center gap-1", className)}
    {...props}
  />
));
PaginationContent.displayName = "PaginationContent";

const PaginationItem = React.forwardRef(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
));
PaginationItem.displayName = "PaginationItem";

const PaginationButton = ({ className, isActive, size = "icon", onClick, disabled, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    aria-current={isActive ? "page" : undefined}
    className={cn(
      "inline-flex items-center justify-center rounded-lg text-sm transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
      size === "icon" ? "h-9 w-9" : "h-9 px-4",
      isActive
        ? "bg-blue-600 text-white font-medium"
        : "border bg-white text-gray-700 hover:bg-gray-50",
      className,
    )}
  >
    {children}
  </button>
);

const PaginationPrevious = ({ className, onClick, disabled }) => (
  <PaginationButton
    className={cn("gap-1", className)}
    size="icon"
    onClick={onClick}
    disabled={disabled}
  >
    <ChevronLeft className="h-4 w-4" />
  </PaginationButton>
);
PaginationPrevious.displayName = "PaginationPrevious";

const PaginationNext = ({ className, onClick, disabled }) => (
  <PaginationButton
    className={cn("gap-1", className)}
    size="icon"
    onClick={onClick}
    disabled={disabled}
  >
    <ChevronRight className="h-4 w-4" />
  </PaginationButton>
);
PaginationNext.displayName = "PaginationNext";

const PaginationEllipsis = ({ className }) => (
  <span
    aria-hidden
    className={cn("flex h-9 w-9 items-center justify-center text-gray-400", className)}
  >
    <MoreHorizontal className="h-4 w-4" />
  </span>
);
PaginationEllipsis.displayName = "PaginationEllipsis";

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationButton,
  PaginationNext,
  PaginationPrevious,
};
