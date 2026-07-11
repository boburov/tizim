import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BarChart3, Tags } from "lucide-react";
import InputField from "@/shared/components/ui/input/InputField";
import Button from "@/shared/components/ui/button/Button";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import useObjectState from "@/shared/hooks/useObjectState";

import FeedbackTable from "../components/FeedbackTable";
import FeedbackTypePicker from "../components/FeedbackTypePicker";
import StatusChips from "../components/StatusChips";
import { useFeedbackListQuery } from "../hooks/useFeedbackQueries";

const LIMIT = 20;

const FeedbackListPage = () => {
  const [searchParams] = useSearchParams();
  const filters = useObjectState({
    search: "",
    status: searchParams.get("status") || "",
    type: "",
  });
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useFeedbackListQuery({
    search: filters.search || undefined,
    status: filters.status || undefined,
    type: filters.type || undefined,
    page,
    limit: LIMIT,
  });

  const items = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const update = (key, value) => {
    filters.setField(key, value);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      {/* Sarlavha + tezkor o'tish */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Feedback'lar</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/owner/feedback/dashboard">
              <BarChart3 className="size-4" />
              Hisobot
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/owner/feedback-types">
              <Tags className="size-4" />
              Turlar
            </Link>
          </Button>
        </div>
      </header>

      {/* Toolbar: qidiruv + tur */}
      <div className="flex flex-col gap-3 rounded-lg border bg-white p-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <InputField
            name="search"
            type="search"
            placeholder="Matn ichidan qidirish..."
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
          />
        </div>
        <div className="w-full sm:w-56">
          <FeedbackTypePicker
            label=""
            value={filters.type}
            onChange={(v) => update("type", v)}
            includeAll
          />
        </div>
      </div>

      {/* Status bo'yicha tez filtr */}
      <StatusChips
        value={filters.status}
        onChange={(v) => update("status", v)}
      />

      {/* Ro'yxat */}
      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <>
          <FeedbackTable items={items} isLoading={isLoading} />
          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              onPageChange={setPage}
              totalPages={totalPages}
              hasNextPage={page < totalPages}
              hasPrevPage={page > 1}
            />
          )}
        </>
      )}
    </div>
  );
};

export default FeedbackListPage;
