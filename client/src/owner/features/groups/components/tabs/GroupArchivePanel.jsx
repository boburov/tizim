import { useState } from "react";
import { useParams } from "react-router-dom";
import { History } from "lucide-react";

import Card from "@/shared/components/ui/card/Card";
import Pagination from "@/shared/components/ui/pagination/Pagination";
import ActivityTimeline from "@/shared/components/ui/timeline/ActivityTimeline";
import useGroupTimelineQuery from "../../hooks/useGroupTimelineQuery";

const LIMIT = 30;

// Guruhning "Arxiv" tabi - faqat shu guruhga tegishli faoliyat tarixi (o'chirilgan
// ma'lumot emas): o'quvchi qo'shilishi/chiqishi, muzlatish, to'lov, qarz, o'qituvchi
// biriktirish, guruh holati o'zgarishlari. Yangi hodisalar yuqorida.
const GroupArchivePanel = () => {
  const { id } = useParams();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useGroupTimelineQuery(id, {
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
          <ActivityTimeline items={items} context="group" />
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

export default GroupArchivePanel;
