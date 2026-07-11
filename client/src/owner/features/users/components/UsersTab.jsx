import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import InputField from "@/shared/components/ui/input/InputField";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import useDebounce from "@/shared/hooks/useDebounce";
import UsersTable from "./UsersTable";
import useUsersListQuery from "../hooks/useUsersListQuery";

const LIMIT = 20;

// role - route element orqali (teacher/student); archived - layout (Outlet context).
const UsersTab = ({ role }) => {
  const { archived = false } = useOutletContext() || {};
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState("desc");
  const debouncedSearch = useDebounce(search);

  const { data, isLoading } = useUsersListQuery({
    role,
    search: debouncedSearch || undefined,
    archived: archived ? "1" : undefined,
    sort,
    order,
    page,
    limit: LIMIT,
  });
  const users = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const handleSort = (field) => {
    setPage(1);
    if (sort === field) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setOrder("asc");
    }
  };

  return (
    <div className="pt-3 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1">
          <InputField
            name="search"
            type="search"
            value={search}
            placeholder="Ism, familiya yoki telefon bo'yicha qidirish..."
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="p-4 text-muted-foreground">Yuklanmoqda...</div>
      ) : (
        <>
          <UsersTable
            users={users}
            archived={archived}
            role={role}
            sort={sort}
            order={order}
            onSort={handleSort}
          />
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

export default UsersTab;
