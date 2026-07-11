import { useState } from "react";
import { Plus } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import useModal from "@/shared/hooks/useModal";
import useDebounce from "@/shared/hooks/useDebounce";
import { MODAL } from "@/shared/constants/modals";
import ArchiveReasonsTable from "./ArchiveReasonsTable";
import useArchiveReasonsQuery from "../hooks/useArchiveReasonsQuery";

const ReasonsTab = () => {
  const [search, setSearch] = useState("");
  const { openModal } = useModal();
  const debouncedSearch = useDebounce(search);

  const { data, isLoading, isError, refetch } = useArchiveReasonsQuery({
    search: debouncedSearch || undefined,
    limit: 200,
  });
  const items = data?.data || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="max-w-sm flex-1">
          <InputField
            name="search"
            type="search"
            placeholder="Sarlavha bo'yicha qidirish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => openModal(MODAL.ARCHIVE_REASON_CREATE)}>
          <Plus className="size-4" />
          Yangi sabab
        </Button>
      </div>

      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <ArchiveReasonsTable items={items} isLoading={isLoading} />
      )}
    </div>
  );
};

export default ReasonsTab;
