import { Snowflake } from "lucide-react";

import Badge from "@/shared/components/ui/badge/Badge";
import useStudentFreezesQuery from "../hooks/useStudentFreezesQuery";
import { formatDateUzLong } from "@/shared/utils/formatDate";

// O'quvchining muzlatish tarixi (arxiv bo'limida "qanday amallar bo'lgan" -
// muzlatilgan/chiqarilgan sanalar, sabab, kim tomonidan). Tarix bo'sh bo'lsa
// hech narsa ko'rsatilmaydi.
const UserFreezeHistory = ({ studentId }) => {
  const { data } = useStudentFreezesQuery(studentId);
  const items = data?.items || [];
  if (items.length === 0) return null;

  const fullName = (u) =>
    u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "";

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Snowflake className="size-4 text-sky-600" />
        <h3 className="font-medium">Muzlatish tarixi</h3>
      </div>
      <ul className="divide-y">
        {items.map((f) => {
          const active = !f.endDate;
          return (
            <li
              key={f._id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {formatDateUzLong(f.startDate)} —{" "}
                  {f.endDate ? formatDateUzLong(f.endDate) : "hozir"}
                </span>
                {active ? (
                  <Badge className="bg-sky-100 text-sky-700">Muzlatilgan</Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-600">Chiqarilgan</Badge>
                )}
              </div>
              <div className="text-muted-foreground">
                {f.reason ? <span>{f.reason}</span> : null}
                {fullName(f.createdBy) && (
                  <span className="ml-2 text-xs">
                    ({fullName(f.createdBy)})
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default UserFreezeHistory;
