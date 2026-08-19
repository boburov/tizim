import { useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";

import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { AnalyticsTable, QueryState } from "@/shared/components/analytics";
import useAuth from "@/shared/hooks/useAuth";
import useGroupsListQuery from "@/owner/features/groups/hooks/useGroupsListQuery";
import WorkspacePage from "@/shared/components/page/PageShell";
import EmptyState from "@/shared/components/page/EmptyState";

/**
 * GURUHLARIM.
 *
 * ── "MENIKI" QANDAY ANIQLANADI ──
 * `teacherId` FILTRI SERVERGA yuboriladi — ro'yxat kelgandan keyin
 * frontendda kesilmaydi. Farqi muhim: client tomonda filtrlash
 * boshqa o'qituvchilarning guruhlarini BARIBIR tarmoq orqali
 * yuborardi (brauzer konsolida ochiq ko'rinardi), garchi ekranda
 * ko'rinmasa ham.
 *
 * O'qituvchi bo'lmagan xodim (masalan resepshin) uchun bu filtr
 * bo'sh natija beradi — bu to'g'ri: unga guruh biriktirilmagan.
 */
const WorkGroupsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { has } = usePermissions();

  const groups = useGroupsListQuery(
    { teacherId: user?.id, limit: 100 },
    { enabled: Boolean(user?.id) && has(PERMISSIONS.GROUPS_READ) },
  );

  if (!has(PERMISSIONS.GROUPS_READ)) {
    return (
      <WorkspacePage title="Guruhlarim">
        <EmptyState
          icon={BookOpen}
          title="Guruhlar yopiq"
          hint="Guruhlarni ko'rish uchun ruxsat kerak."
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage
      title="Guruhlarim"
      subtitle="Menga biriktirilgan guruhlar. Qatorni bosing — guruh sahifasi ochiladi."
    >
      <QueryState
        query={groups}
        empty={!groups.data?.data?.length}
        emptyTitle="Sizga guruh biriktirilmagan"
        emptyHint="Administrator sizni guruhga o'qituvchi qilib biriktirgach, ular shu yerda ko'rinadi."
        loadingRows={3}
      >
        {(res) => (
          <AnalyticsTable
            rows={res.data}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/owner/groups/${r.id}`)}
            columns={[
              { key: "name", label: "Guruh" },
              { key: "studentsCount", label: "O'quvchi", align: "right", kind: "number" },
              {
                key: "schedule",
                label: "Jadval",
                render: (r) =>
                  (r.schedule || [])
                    .map((s) => `${s.day} ${s.startTime}`)
                    .join(", ") || "—",
              },
              {
                key: "isActive",
                label: "Holat",
                render: (r) => (r.isActive ? "Faol" : "Yopilgan"),
              },
            ]}
          />
        )}
      </QueryState>
    </WorkspacePage>
  );
};

export default WorkGroupsPage;
