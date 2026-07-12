import { useState } from "react";
import { useParams } from "react-router-dom";
import { History } from "lucide-react";

import Card from "@/shared/components/ui/card/Card";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import ActivityTimeline from "@/shared/components/ui/timeline/ActivityTimeline";
import useStudentTimelineQuery from "../../hooks/useStudentTimelineQuery";

const LIMIT = 30;

// O'quvchining "Arxiv" tabi - to'liq faoliyat tarixi (o'chirilgan ma'lumot emas):
// guruh o'zgarishlari, to'lovlar, qarzlar, depozit, muzlatish/chiqarish va boshqa
// ma'muriy amallar. Yangi hodisalar yuqorida.
const UserArchivePanel = () => {
  const { id } = useParams();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useStudentTimelineQuery(id, {
    page,
    limit: LIMIT,
  });

  const items = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <Card
      title="Faoliyat tarixi"
      icon={<History className="size-5 text-muted-foreground" />}
    >
      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
        ) : isError ? (
          <p className="text-sm text-red-600">Tarixni yuklashda xatolik</p>
        ) : (
          <ActivityTimeline items={items} context="student" />
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4">
          <Pagination
            currentPage={page}
            onPageChange={setPage}
            totalPages={totalPages}
            hasPrevPage={page > 1}
            hasNextPage={page < totalPages}
          />
        </div>
      )}
    </Card>
  );
};

export default UserArchivePanel;
