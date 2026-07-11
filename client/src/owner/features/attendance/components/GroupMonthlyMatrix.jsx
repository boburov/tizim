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
      swatch={<span className="block w-2.5 h-2.5 rounded-full bg-gray-200" />}
    >
      Belgilanmagan
    </LegendItem>
    <LegendItem
      swatch={<span className="block w-2.5 h-2.5 rounded-sm bg-rose-100" />}
    >
      Bayram
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

  const dates = data.dates || [];

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
              <th className="sticky left-0 z-20 w-44 min-w-[11rem] bg-white border-b border-gray-100 px-3 py-2 text-left font-medium text-gray-400 whitespace-nowrap">
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
                    className={`w-8 border-b border-gray-100 px-0 py-1.5 text-center font-medium ${headerCls}`}
                  >
                    <div className="leading-none">{day}</div>
                    <div className="mt-0.5 text-[9px] font-normal uppercase tracking-wide text-gray-300">
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
                  <td className="sticky left-0 z-10 w-44 min-w-[11rem] bg-white border-b border-gray-100 px-3 py-1.5 truncate text-gray-700 group-hover:bg-gray-50">
                    {name || row.student.username || "-"}
                  </td>
                  {dates.map((d) => {
                    const colKey = d.colKey || d.dateKey;
                    const cell = row.cells?.[colKey];
                    const cellCls = `w-8 h-7 border-b border-gray-100 ${
                      d.isHoliday ? "bg-rose-50/50" : ""
                    } group-hover:bg-gray-50`;
                    if (!d.isClassDay || cell === null || cell === undefined) {
                      return <td key={colKey} className={cellCls} />;
                    }
                    const displayed = cell.status || cell.defaultStatus;
                    const label = d.slot ? `${d.dateKey} ${d.startTime}` : d.dateKey;
                    const dotCls = displayed
                      ? `w-2.5 h-2.5 ${bgOf(displayed)}`
                      : "w-1.5 h-1.5 bg-gray-200 group-hover/cell:bg-gray-300";
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
                            className="group/cell flex h-7 w-full items-center justify-center rounded transition-colors hover:bg-gray-100"
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
