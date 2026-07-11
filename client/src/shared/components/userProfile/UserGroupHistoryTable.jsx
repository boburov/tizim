import { formatDateUz } from "@/shared/utils/formatDate";

const REASON_LABEL = {
  removed: "Chiqarildi",
  transferred: "Boshqa guruhga",
  graduated: "Bitirdi",
};

const UserGroupHistoryTable = ({ items = [], isLoading = false }) => {
  if (isLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Yuklanmoqda...</div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground">
        Tarix bo'sh
      </div>
    );
  }

  return (
    <div className="border rounded-sm overflow-x-auto bg-white">
      <table className="w-full text-sm">
        <thead className=" text-left">
          <tr>
            <th className="px-4 py-2 font-medium">Guruh</th>
            <th className="px-4 py-2 font-medium">Qo'shilgan</th>
            <th className="px-4 py-2 font-medium">Chiqqan</th>
            <th className="px-4 py-2 font-medium">Holati</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => {
            const status = m.leftAt
              ? REASON_LABEL[m.leftReason] || "Chiqqan"
              : "O'qimoqda";
            return (
              <tr key={m._id} className="border-t">
                <td className="px-4 py-2">{m.group?.name || "-"}</td>
                <td className="px-4 py-2">{formatDateUz(m.joinedAt)}</td>
                <td className="px-4 py-2">{formatDateUz(m.leftAt)}</td>
                <td className="px-4 py-2">
                  <span
                    className={
                      m.leftAt
                        ? "text-muted-foreground"
                        : "text-green-600 font-medium"
                    }
                  >
                    {status}
                  </span>
                  {m.transferredTo?.name && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      → {m.transferredTo.name}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default UserGroupHistoryTable;
