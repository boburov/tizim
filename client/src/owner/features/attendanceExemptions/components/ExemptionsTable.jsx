import { Trash2 } from "lucide-react";
import Badge from "@/shared/components/ui/badge/Badge";
import Button from "@/shared/components/ui/button/Button";
import useModal from "@/shared/hooks/useModal";
import useStudentExemptionsQuery from "../hooks/useStudentExemptionsQuery";
import { MODAL } from "@/shared/constants/modals";
import { DAY_SHORT } from "@/shared/constants/attendance";
import { formatDateUz } from "@/shared/utils/formatDate";

const ExemptionsTable = ({ studentId }) => {
  const { openModal } = useModal();
  const { data, isLoading } = useStudentExemptionsQuery(studentId);
  const items = data?.data || [];

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Yuklanmoqda...</div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground">
        Davomatdan ozod davrlari yo'q
      </div>
    );
  }

  return (
    <div className="border rounded-sm overflow-x-auto bg-white">
      <table className="w-full text-sm">
        <thead className=" text-left">
          <tr>
            <th className="px-4 py-2 font-medium">Boshlanish</th>
            <th className="px-4 py-2 font-medium">Tugash</th>
            <th className="px-4 py-2 font-medium">Hafta kunlari</th>
            <th className="px-4 py-2 font-medium">Sabab</th>
            <th className="px-4 py-2 font-medium">Holat</th>
            <th className="px-4 py-2 font-medium text-right">Amallar</th>
          </tr>
        </thead>
        <tbody>
          {items.map((ex) => (
            <tr key={ex._id} className="border-t">
              <td className="px-4 py-2">{formatDateUz(ex.startDate)}</td>
              <td className="px-4 py-2">
                {ex.endDate ? (
                  formatDateUz(ex.endDate)
                ) : (
                  <span className="text-muted-foreground">Kurs tugaguncha</span>
                )}
              </td>
              <td className="px-4 py-2">
                {!ex.daysOfWeek || ex.daysOfWeek.length === 0
                  ? "Barcha kunlar"
                  : ex.daysOfWeek.map((d) => DAY_SHORT[d]).join(", ")}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {ex.reason || "-"}
              </td>
              <td className="px-4 py-2">
                {ex.isActive ? (
                  <Badge className="bg-green-100 text-green-700">Faol</Badge>
                ) : (
                  <Badge variant="outline">Nofaol</Badge>
                )}
              </td>
              <td className="px-4 py-2">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() =>
                      openModal(MODAL.ATTENDANCE_EXEMPTION_DELETE, {
                        exemption: ex,
                      })
                    }
                    
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ExemptionsTable;
