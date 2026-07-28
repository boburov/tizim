import { FileClock } from "lucide-react";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { cn } from "@/shared/utils/cn";
import { formatDateUz } from "@/shared/utils/formatDate";
import ActionBadge from "./ActionBadge";
import LogUserCell from "./LogUserCell";

const timeOnly = (dateLike) => {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
};

const TH = ({ children, className = "" }) => (
  <th
    className={cn(
      "px-4 py-3 text-left text-xs font-medium tracking-wide text-slate-500",
      className,
    )}
  >
    {children}
  </th>
);

const ActivityLogsTable = ({ items = [] }) => {
  const { openModal } = useModal();

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white py-16">
        <FileClock className="size-10 text-slate-300" strokeWidth={1.5} />
        <p className="text-sm text-slate-500">
          Hozircha faoliyat qaydlari mavjud emas
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[900px] border-collapse">
        <thead className="bg-slate-50/80">
          <tr className="border-b border-slate-200">
            <TH className="pl-6">Foydalanuvchi</TH>
            <TH>Amal</TH>
            <TH>Tavsif</TH>
            <TH>Obyekt ID</TH>
            <TH className="pr-6 text-right">Vaqt</TH>
          </tr>
        </thead>
        <tbody>
          {items.map((log) => (
            <tr
              key={log._id}
              onClick={() =>
                openModal(MODAL.ACTIVITY_LOG_DETAIL, { logId: log._id })
              }
              className={cn(
                "group h-[68px] cursor-pointer border-b border-slate-100 transition-colors last:border-b-0",
                "hover:bg-indigo-50/40",
                // Muvaffaqiyatsiz so'rovlar status ustunisiz ham ajralib tursin
                log.failed && "border-l-2 border-l-rose-500 bg-rose-50/20",
              )}
            >
              <td className="max-w-[240px] py-3 pl-6 pr-4">
                <LogUserCell
                  user={log.user}
                  userRole={log.userRole}
                  actorLabel={log.actorLabel}
                />
              </td>

              <td className="whitespace-nowrap px-4 py-3">
                <ActionBadge action={log.action} failed={log.failed} />
              </td>

              <td className="max-w-[320px] px-4 py-3">
                <span className="block truncate text-sm text-slate-700">
                  {log.description}
                </span>
              </td>

              <td className="px-4 py-3">
                {log.resourceId ? (
                  <code
                    title={log.resourceId}
                    className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600"
                  >
                    {log.resourceId.slice(0, 8)}…
                  </code>
                ) : (
                  <span className="text-xs text-slate-300">—</span>
                )}
              </td>

              {/* Hover'da vaqt o'rniga "Batafsil" havolasi chiqadi */}
              <td className="w-[150px] py-3 pl-4 pr-6 text-right">
                <div className="group-hover:hidden">
                  <div className="text-sm text-slate-700">
                    {formatDateUz(log.createdAt)}
                  </div>
                  <div className="text-xs text-slate-400">
                    {timeOnly(log.createdAt)}
                  </div>
                </div>
                <span className="hidden text-sm font-medium text-indigo-600 group-hover:inline">
                  Batafsil
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ActivityLogsTable;
