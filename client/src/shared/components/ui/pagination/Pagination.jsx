// Icons
import { ChevronLeft, ChevronRight } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";

// React
import { memo, useEffect, useMemo, useState } from "react";

const Pagination = ({
  contentRef,
  currentPage,
  onPageChange,
  totalPages = 1,
  className = "",
  maxPageButtons = 5,
  hasNextPage = false,
  hasPrevPage = false,
  showPageNumbers = true,
}) => {
  if (totalPages <= 1 && !showPageNumbers) {
    return null;
  }

  const [isFirst, setIsFirst] = useState(true);
  const scrollToTop = useMemo(() => {
    if (!contentRef || !contentRef.current) return 0;
    const rect = contentRef.current.getBoundingClientRect();
    return rect.top + window.scrollY - 44;
  }, [contentRef]);

  useEffect(() => {
    if (isFirst) {
      setIsFirst(false);
    } else {
      window.scrollTo({ top: scrollToTop, left: 0, behavior: "smooth" });
    }
  }, [currentPage]);

  const goToPage = (page) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    onPageChange(page);
  };

  const goToNextPage = () => {
    if (hasNextPage) {
      goToPage(currentPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (hasPrevPage) {
      goToPage(currentPage - 1);
    }
  };

  const getPageNumbers = () => {
    if (totalPages <= maxPageButtons) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = [];
    const halfMaxButtons = Math.floor(maxPageButtons / 2);

    let startPage = Math.max(1, currentPage - halfMaxButtons);
    let endPage = Math.min(totalPages, currentPage + halfMaxButtons);

    if (currentPage <= halfMaxButtons) {
      endPage = Math.min(totalPages, maxPageButtons);
    } else if (currentPage >= totalPages - halfMaxButtons) {
      startPage = Math.max(1, totalPages - maxPageButtons + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();
  const showFirstPage = totalPages > maxPageButtons && pageNumbers[0] > 1;
  const showLastPage =
    totalPages > maxPageButtons &&
    pageNumbers[pageNumbers.length - 1] < totalPages;
  const showStartEllipsis = showFirstPage && pageNumbers[0] > 2;
  const showEndEllipsis =
    showLastPage && pageNumbers[pageNumbers.length - 1] < totalPages - 1;

  return (
    <div className={`flex items-center justify-center gap-3.5 ${className}`}>
      {/* Previous Button */}
      <Button
        variant="outline"
        onClick={goToPrevPage}
        disabled={!hasPrevPage}
        aria-label="Oldingi sahifa"
        className="h-9 gap-2 pr-2.5 pl-2 md:h-11 md:pr-5 md:pl-4"
      >
        <ChevronLeft size={20} className="-translate-x-0.5" />
        <span>Oldingi</span>
      </Button>

      {/* Page Numbers */}
      {showPageNumbers && (
        <div className="flex items-center gap-3.5">
          {/* First Page */}
          {showFirstPage && (
            <>
              <Button
                variant="outline"
                aria-label="1-sahifa"
                onClick={() => goToPage(1)}
                className="size-9 px-0 md:size-11"
              >
                1
              </Button>

              {showStartEllipsis && (
                <span className="px-2 text-gray-400">...</span>
              )}
            </>
          )}

          {/* Page Number Buttons */}
          {pageNumbers.map((pageNum) => (
            <Button
              key={pageNum}
              aria-label={`${pageNum}-sahifa`}
              onClick={() => goToPage(pageNum)}
              className="size-9 px-0 md:size-11"
              variant={pageNum === currentPage ? "default" : "outline"}
              aria-current={pageNum === currentPage ? "page" : undefined}
            >
              {pageNum}
            </Button>
          ))}

          {/* Last Page */}
          {showLastPage && (
            <>
              {showEndEllipsis && (
                <span className="px-2 text-gray-400">...</span>
              )}

              <Button
                variant="outline"
                className="size-9 px-0 md:size-11"
                aria-label={`${totalPages}-sahifa`}
                onClick={() => goToPage(totalPages)}
              >
                {totalPages}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Current Page Only (when showPageNumbers is false) */}
      {!showPageNumbers && (
        <span className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium">
          {currentPage}
        </span>
      )}

      {/* Next Button */}
      <Button
        variant="outline"
        onClick={goToNextPage}
        disabled={!hasNextPage}
        aria-label="Keyingi sahifa"
        className="h-9 gap-2 pl-2.5 pr-2 md:h-11 md:pl-5 md:pr-4"
      >
        <span>Keyingi</span>
        <ChevronRight size={20} className="translate-x-0.5" />
      </Button>
    </div>
  );
};

export default memo(Pagination);
