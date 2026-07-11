import { useState } from "react";
import { Plus } from "lucide-react";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import useObjectState from "@/shared/hooks/useObjectState";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";

import HolidaysTable from "../components/HolidaysTable";
import HolidayCreateModal from "../components/HolidayCreateModal";
import HolidayEditModal from "../components/HolidayEditModal";
import HolidayDeleteModal from "../components/HolidayDeleteModal";
import TeacherBirthdaysCard from "../components/TeacherBirthdaysCard";
import TeacherCongratulateModal from "../components/TeacherCongratulateModal";
import useHolidaysQuery from "../hooks/useHolidaysQuery";

const HolidaysListPage = () => {
  const filters = useObjectState({
    search: "",
    includeInactive: false,
    includePast: false,
  });
  const { openModal } = useModal();

  const { data, isLoading, isError, refetch } = useHolidaysQuery({
    search: filters.search || undefined,
    includeInactive: filters.includeInactive,
    includePast: filters.includePast,
    limit: 200,
  });
  const items = data?.data || [];

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Bayramlar</h1>
        <Button onClick={() => openModal(MODAL.HOLIDAY_CREATE)}>
          <Plus className="size-4" />
          Yangi bayram
        </Button>
      </header>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="max-w-sm flex-1">
          <InputField
            name="search"
            placeholder="Nom bo'yicha qidirish..."
            value={filters.search}
            onChange={(e) => filters.setField("search", e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.includeInactive}
            onChange={(e) =>
              filters.setField("includeInactive", e.target.checked)
            }
          />
          Arxivlangan
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.includePast}
            onChange={(e) => filters.setField("includePast", e.target.checked)}
          />
          O'tgan bir martalik
        </label>
      </div>

      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <HolidaysTable items={items} isLoading={isLoading} />
      )}

      <TeacherBirthdaysCard />

      <ModalWrapper
        name={MODAL.TEACHER_BIRTHDAY_CONGRATULATE}
        title="O'qituvchini tabriklash"
      >
        <TeacherCongratulateModal />
      </ModalWrapper>

      <ModalWrapper name={MODAL.HOLIDAY_CREATE} title="Yangi bayram">
        <HolidayCreateModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.HOLIDAY_EDIT} title="Bayramni tahrirlash">
        <HolidayEditModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.HOLIDAY_DELETE} title="Bayramni o'chirish">
        <HolidayDeleteModal />
      </ModalWrapper>
    </div>
  );
};

export default HolidaysListPage;
