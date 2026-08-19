import { useNavigate } from "react-router-dom";
import { GraduationCap } from "lucide-react";

import useAuth from "@/shared/hooks/useAuth";
import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { AnalyticsTable, QueryState } from "@/shared/components/analytics";
import useGroupsListQuery from "@/owner/features/groups/hooks/useGroupsListQuery";
import WorkspacePage from "@/workspaces/shared/WorkspacePage";
import EmptyState from "@/workspaces/shared/EmptyState";

/**
 * O'QUVCHILARIM.
 *
 * ── NEGA GURUH ORQALI ──
 * "Mening o'quvchilarim" degan alohida endpoint YO'Q va uni yaratish
 * kerak emas: o'qituvchi bilan o'quvchi orasidagi bog'lanish GURUH
 * orqali ketadi. Shuning uchun ekran guruhlarni ko'rsatadi va har
 * biridan o'quvchilar ro'yxatiga o'tiladi — bu bog'lanishning
 * haqiqiy shakli va u tushunarli.
 *
 * Bu ataylab: "hamma o'quvchini bitta ro'yxatda" ko'rsatish uchun
 * server tomonda yangi so'rov kerak bo'lardi va u o'qituvchiga
 * guruhdan tashqaridagi odamni ham ochib qo'yish xavfini tug'dirardi.
 */
const WorkStudentsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { has } = usePermissions();

  const groups = useGroupsListQuery(
    { teacherId: user?.id, limit: 100 },
    { enabled: Boolean(user?.id) && has(PERMISSIONS.GROUPS_READ) },
  );

  if (!has(PERMISSIONS.GROUPS_READ)) {
    return (
      <WorkspacePage title="O'quvchilarim">
        <EmptyState
          icon={GraduationCap}
          title="Ro'yxat yopiq"
          hint="O'quvchilarni ko'rish uchun guruhlarga ruxsat kerak."
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage
      title="O'quvchilarim"
      subtitle="Guruhni bosing — o'sha guruhning o'quvchilari ochiladi"
    >
      <QueryState
        query={groups}
        empty={!groups.data?.data?.length}
        emptyTitle="Sizda o'quvchi yo'q"
        emptyHint="Sizga guruh biriktirilgach, uning o'quvchilari shu yerda ko'rinadi."
        loadingRows={3}
      >
        {(res) => (
          <AnalyticsTable
            rows={res.data}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/owner/groups/${r.id}/o-quvchilar`)}
            defaultSort={{ key: "studentsCount", dir: "desc" }}
            columns={[
              { key: "name", label: "Guruh" },
              { key: "studentsCount", label: "O'quvchi", align: "right", kind: "number" },
            ]}
          />
        )}
      </QueryState>
    </WorkspacePage>
  );
};

export default WorkStudentsPage;
