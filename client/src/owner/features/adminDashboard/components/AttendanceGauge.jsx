// Reference: "Project Progress" - yarim doira gauge. Bu yerda bugungi davomat foizi.
const AttendanceGauge = ({ gauge }) => {
  const rate = gauge?.rate ?? null;
  const hasData = rate != null;

  // Yarim doira: 180 daraja. radius=70, perimetr (yarim) = pi*r.
  const r = 70;
  const semi = Math.PI * r; // yarim aylana uzunligi
  const filled = hasData ? (rate / 100) * semi : 0;

  const legend = [
    { label: "Kelgan", value: gauge?.present ?? 0, color: "bg-primary" },
    { label: "Kechikkan", value: gauge?.late ?? 0, color: "bg-primary/40" },
    { label: "Kelmagan", value: gauge?.absent ?? 0, color: "bg-zinc-200" },
  ];

  return (
    <div className="flex h-full flex-col rounded-2xl border border-zinc-200/80 bg-white p-5">
      <h2 className="font-semibold text-zinc-900">Bugungi davomat</h2>

      <div className="relative mx-auto mt-4 w-full max-w-[220px]">
        <svg viewBox="0 0 160 90" className="w-full">
          <path
            d="M 10 85 A 70 70 0 0 1 150 85"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="16"
            strokeLinecap="round"
          />
          {hasData && (
            <path
              d="M 10 85 A 70 70 0 0 1 150 85"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${semi}`}
              className="transition-all duration-700"
            />
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="text-3xl font-bold tabular-nums text-zinc-900">
            {hasData ? `${rate}%` : "-"}
          </span>
          <span className="text-xs text-zinc-500">
            {hasData ? `${gauge.total} ta belgilangan` : "Ma'lumot yo'q"}
          </span>
        </div>
      </div>

      <div className="mt-auto flex justify-center gap-4 pt-4">
        {legend.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${l.color}`} />
            <span className="text-xs text-zinc-600">
              {l.label} <span className="font-semibold text-zinc-900">{l.value}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AttendanceGauge;
