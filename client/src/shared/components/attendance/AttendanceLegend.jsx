import {
  ATTENDANCE_STATUSES,
  STATUS_LABEL,
  STATUS_BADGE_CLASS,
} from "@/shared/constants/attendance";

const AttendanceLegend = () => (
  <div className="flex items-center gap-3 flex-wrap text-xs">
    {ATTENDANCE_STATUSES.map((s) => (
      <span key={s} className="flex items-center gap-1.5">
        <span
          className={`inline-block size-3 rounded ${STATUS_BADGE_CLASS[s]?.split(" ")[0] || "bg-gray-300"}`}
        />
        <span>{STATUS_LABEL[s]}</span>
      </span>
    ))}
    <span className="flex items-center gap-1.5">
      <span className="inline-block size-3 rounded border bg-white" />
      <span>Belgilanmagan</span>
    </span>
  </div>
);

export default AttendanceLegend;
