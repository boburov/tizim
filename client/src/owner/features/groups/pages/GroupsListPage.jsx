// State
import { useState } from "react";

// Icons
import { Plus, Search } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import ArchiveToggle from "@/shared/components/ui/archive/ArchiveToggle";
import GroupCard from "../components/GroupCard";
import GroupCreateModal from "../components/modals/GroupCreateModal";

// Hooks
import useModal from "@/shared/hooks/useModal";
import useDebounce from "@/shared/hooks/useDebounce";
import useGroupsListQuery from "../hooks/useGroupsListQuery";

// Constants
import { MODAL } from "@/shared/constants/modals";

const LIMIT = 24;

const GroupsListPage = () => {
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const { openModal } = useModal();
  const debouncedSearch = useDebounce(search);

  const { data, isLoading } = useGroupsListQuery({
    search: debouncedSearch || undefined,
    archived: archived ? "1" : undefined,
    page,
    limit: LIMIT,
  });
  const groups = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Guruhlar</h1>
        <ArchiveToggle
          value={archived}
          onChange={(v) => {
            setArchived(v);
            setPage(1);
          }}
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <InputField
          name="search"
          type="search"
          value={search}
          placeholder="Guruh nomi bo'yicha qidirish..."
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />

        {!archived && (
          <Button onClick={() => openModal(MODAL.GROUP_CREATE)}>
            <Plus className="size-4" />
            Yangi guruh
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="p-8 text-center text-muted-foreground">
          Yuklanmoqda...
        </div>
      )}

      {!isLoading && groups.length === 0 && (
        <div className="border rounded-lg p-12 text-center bg-white">
          <Search className="size-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            Hech qanday guruh topilmadi. "Yangi guruh" tugmasini bosib boshlang.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((g) => (
          <GroupCard key={g._id} group={g} archived={archived} />
        ))}
      </div>

      {!isLoading && totalPages > 1 && (
        <Pagination
          currentPage={page}
          onPageChange={setPage}
          totalPages={totalPages}
          hasNextPage={page < totalPages}
          hasPrevPage={page > 1}
        />
      )}

      <ModalWrapper
        name={MODAL.GROUP_CREATE}
        title="Yangi guruh"
        className="max-w-4xl"
      >
        <GroupCreateModal />
      </ModalWrapper>
    </div>
  );
};

export default GroupsListPage;
