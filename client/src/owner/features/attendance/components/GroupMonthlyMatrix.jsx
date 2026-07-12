import Card from "@/shared/components/ui/card/Card";
import Tooltip from "@/shared/components/ui/tooltip/Tooltip";
import {
  ATTENDANCE_STATUSES,
  STATUS_LABEL,
  STATUS_DOT_CLASS,
  DAY_SHORT,
} from "@/shared/constants/attendance";
import useGroupMonthlyAttendanceQuery from "../hooks/useGroupMonthlyAttendanceQuery";
import useMatrixCellMutation from "../hooks/useMatrixCellMutation";

const bgOf = (status) => STATUS_DOT_CLASS[status] || "bg-slate-300";

// Katakni bosganda status shu tartibda aylanadi (belgilanmagan → present → ...)
const CYCLE = ATTENDANCE_STATUSES; // ["present", "absent", "excused", "exempt"]
const nextStatus = (current) => {
  if (!current) return CYCLE[0];
  const i = CYCLE.indexOf(current);
  return CYCLE[(i + 1) % CYCLE.length];
};

const tooltipText = (dateKey, status, cell) => {
  const parts = [`${dateKey} - ${STATUS_LABEL[status]}`];
  if (status === "excused" && cell.reason) parts.push(cell.reason);
  return parts.join(" · ");
};

const LegendItem = ({ swatch, children }) => (
  <span className="inline-flex items-center gap-1.5">
    {swatch}
    {children}
  </span>
);

const Legend = () => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600">
    {ATTENDANCE_STATUSES.map((s) => (
      <LegendItem
        key={s}
        swatch={<span className={`block w-2.5 h-2.5 rounded-full ${bgOf(s)}`} />}
      >
        {STATUS_LABEL[s]}
      </LegendItem>
    ))}
    <LegendItem
      swatch={
        <span className="block w-2.5 h-2.5 rounded-full border-2 border-gray-300" />
      }
    >
      Belgilanmagan
    </LegendItem>
  </div>
);

const GroupMonthlyMatrix = ({ groupId, year, month }) => {
  const { data, isLoading } = useGroupMonthlyAttendanceQuery(groupId, {
    year,
    month,
  });
  const { mutate: markCell } = useMatrixCellMutation(groupId, { year, month });

  const handleCellClick = (studentId, d, cell) => {
    const status = nextStatus(cell?.status || cell?.defaultStatus);
    markCell({
      studentId,
      dateKey: d.dateKey,
      slot: d.slot,
      colKey: d.colKey || d.dateKey,
      status,
    });
  };

  if (!groupId) {
    return (
      <Card>
        <p className="py-6 text-center text-muted-foreground">Guruh tanlang</p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <p className="py-6 text-center text-muted-foreground">Yuklanmoqda...</p>
      </Card>
    );
  }

  if (!data || !data.students?.length) {
    return (
      <Card>
        <Legend />
        <p className="py-6 text-center text-muted-foreground mt-3">Ma'lumot yo'q</p>
      </Card>
    );
  }

  // Faqat dars kunlari ustun bo'ladi (jadval versiyalanishi server tomonda hisobga
  // olingan - qaysi sanada qaysi jadval amal qilgan bo'lsa, o'sha kunlar chiqadi)
  const dates = (data.dates || []).filter((d) => d.isClassDay);

  if (dates.length === 0) {
    return (
      <Card>
        <Legend />
        <p className="py-6 text-center text-muted-foreground mt-3">
          Bu oyda dars kuni yo'q
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Legend />
        <p className="text-[11px] text-gray-400">
          Katakni bosib davomat belgilang
        </p>
      </div>
      <div className="relative overflow-x-auto rounded-md border border-gray-100">
        <table className="w-auto border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-48 min-w-[12rem] bg-white border-b border-r border-gray-200 px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">
                O'quvchi
              </th>
              {dates.map((d) => {
                const day = d.dateKey.slice(8);
                const headerCls = d.isHoliday
                  ? "text-rose-300"
                  : d.isClassDay
                    ? "text-gray-500"
                    : "text-gray-300";
                return (
                  <th
                    key={d.colKey || d.dateKey}
                    title={
                      d.isHoliday
                        ? "Bayram/dam olish kuni"
                        : d.slot
                          ? `${day}-kun, ${d.startTime}`
                          : undefined
                    }
                    className={`w-12 min-w-[3rem] border-b border-r border-gray-200 px-0 py-2.5 text-center font-semibold ${headerCls}`}
                  >
                    <div className="text-[13px] leading-none">{day}</div>
                    <div className="mt-1 text-[10px] font-normal uppercase tracking-wide text-gray-400">
                      {d.slot ? d.startTime : DAY_SHORT[d.dayOfWeek]}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.students.map((row) => {
              const sid = row.student._id;
              const name = `${row.student.firstName || ""} ${row.student.lastName || ""}`.trim();
              return (
                <tr key={sid} className="group">
                  <td className="sticky left-0 z-10 w-48 min-w-[12rem] bg-white border-b border-r border-gray-200 px-3 py-2 truncate text-gray-700 group-hover:bg-gray-50">
                    {name || row.student.username || "-"}
                  </td>
                  {dates.map((d) => {
                    const colKey = d.colKey || d.dateKey;
                    const cell = row.cells?.[colKey];
                    const cellCls = `w-12 h-11 border-b border-r border-gray-200 ${
                      d.isHoliday ? "bg-rose-50/50" : ""
                    } group-hover:bg-gray-50`;
                    if (!d.isClassDay || cell === null || cell === undefined) {
                      return <td key={colKey} className={cellCls} />;
                    }
                    const displayed = cell.status || cell.defaultStatus;
                    const label = d.slot ? `${d.dateKey} ${d.startTime}` : d.dateKey;
                    const dotCls = displayed
                      ? `w-4 h-4 ${bgOf(displayed)}`
                      : "w-3 h-3 border-2 border-gray-300 group-hover/cell:border-gray-400";
                    return (
                      <td key={colKey} className={cellCls}>
                        <Tooltip
                          content={
                            displayed
                              ? tooltipText(label, displayed, cell)
                              : `${label} - belgilash uchun bosing`
                          }
                        >
                          <button
                            type="button"
                            onClick={() => handleCellClick(sid, d, cell)}
                            className="group/cell flex h-11 w-full items-center justify-center rounded transition-colors hover:bg-gray-100"
                          >
                            <span className={`block rounded-full ${dotCls}`} />
                          </button>
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default GroupMonthlyMatrix;
