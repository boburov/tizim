import { Link } from "react-router-dom";

import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import { formatDateUz } from "@/shared/utils/formatDate";
import { formatMonths } from "../utils/formatMonths";
import useChurnedStudentsQuery from "../hooks/useChurnedStudentsQuery";

// ModalWrapper openModal'dagi data'ni spread qiladi (...data), shuning uchun
// `params` prop'i to'g'ridan-to'g'ri keladi. `close` ham cloneElement orqali.
const ChurnedStudentsModal = ({ params = {}, close }) => {
  const {
    data: items,
    isLoading,
    isError,
    refetch,
  } = useChurnedStudentsQuery(params);

  if (isError) return <ErrorState onRetry={refetch} />;
  if (isLoading) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Yuklanmoqda...
      </div>
    );
  }

  const list = items || [];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Jami {list.length} ta o'quvchi guruhdan chiqarilgan
      </p>

      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Bu davrda chiqib ketgan o'quvchi yo'q
        </p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">O'quvchi</th>
                <th className="px-3 py-2 font-medium">Guruh</th>
                <th className="px-3 py-2 font-medium text-right">Muddat</th>
                <th className="px-3 py-2 font-medium">Sabab</th>
                <th className="px-3 py-2 font-medium text-right">Chiqqan sana</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.membershipId} className="border-t">
                  <td className="px-3 py-2">
                    <Link
                      to={`/owner/users/${s.studentId}`}
                      onClick={() => close?.()}
                      className="font-medium hover:underline"
                    >
                      {s.studentName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {s.groupName}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {formatMonths(s.durationMonths)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                      {s.reasonTitle}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {formatDateUz(s.leftAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ChurnedStudentsModal;
