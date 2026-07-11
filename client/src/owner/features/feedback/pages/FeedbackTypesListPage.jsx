import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import BackLink from "@/shared/components/ui/link/BackLink";
import InputField from "@/shared/components/ui/input/InputField";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";

import FeedbackTypesTable from "../components/FeedbackTypesTable";
import FeedbackTypeCreateModal from "../components/modals/FeedbackTypeCreateModal";
import FeedbackTypeEditModal from "../components/modals/FeedbackTypeEditModal";
import FeedbackTypeDeleteModal from "../components/modals/FeedbackTypeDeleteModal";
import useFeedbackTypesQuery from "../hooks/useFeedbackTypesQuery";
import { useFeedbackTypeUpdateMutation } from "../hooks/useFeedbackTypeMutations";
import { useFeedbackStatsQuery } from "../hooks/useFeedbackQueries";

const FeedbackTypesListPage = () => {
  const [search, setSearch] = useState("");
  const { openModal } = useModal();

  const { data, isLoading, isError, refetch } = useFeedbackTypesQuery({
    search,
    includeInactive: true,
    limit: 200,
  });
  const items = data?.data || [];

  // Har bir turga nechta feedback bog'langanini stats.byType dan olamiz
  const { data: stats } = useFeedbackStatsQuery();
  const counts = useMemo(() => {
    const map = {};
    (stats?.byType || []).forEach((t) => {
      if (t.typeId) map[String(t.typeId)] = t.count;
    });
    return map;
  }, [stats]);

  const { mutate: updateType } = useFeedbackTypeUpdateMutation();
  const handleToggle = (type, isActive) =>
    updateType({ id: type._id, body: { isActive } });

  const openCreate = () => openModal(MODAL.FEEDBACK_TYPE_CREATE);

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <BackLink to="/owner/feedback" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Feedback turlari</h1>
          </div>
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Yangi tur
          </Button>
        </div>
      </header>

      <div className="sm:max-w-xs">
        <InputField
          type="search"
          name="search"
          placeholder="Tur nomi bo'yicha qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <FeedbackTypesTable
          items={items}
          counts={counts}
          isLoading={isLoading}
          onToggle={handleToggle}
          onCreate={openCreate}
        />
      )}

      <ModalWrapper name={MODAL.FEEDBACK_TYPE_CREATE} title="Yangi feedback turi">
        <FeedbackTypeCreateModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.FEEDBACK_TYPE_EDIT} title="Turni tahrirlash">
        <FeedbackTypeEditModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.FEEDBACK_TYPE_DELETE} title="Turni o'chirish">
        <FeedbackTypeDeleteModal />
      </ModalWrapper>
    </div>
  );
};

export default FeedbackTypesListPage;
