import {
  fieldLabel,
  formatValue,
  summarizeScheduleItem,
} from "../utils/formatLogValue";

// Ichki obyekt/massivlarni ham o'qiladigan holatga keltiramiz.
// Admin JSON emas, "Dars jadvali: Yakshanba 14:00–15:30" ko'rishi kerak.
const renderComplex = (key, value) => {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-400">Bo'sh</span>;

    // Dars jadvali kabi obyektlar massivi
    if (typeof value[0] === "object" && value[0] !== null) {
      return (
        <ul className="space-y-0.5">
          {value.map((item, i) => (
            <li key={i} className="text-slate-800">
              {summarizeScheduleItem(item)}
            </li>
          ))}
        </ul>
      );
    }
    // Oddiy qiymatlar massivi
    return (
      <span className="text-slate-800">
        {value.map((v) => formatValue(key, v) ?? String(v)).join(", ")}
      </span>
    );
  }

  // Ichki obyekt - kalit/qiymat juftliklari
  return (
    <div className="space-y-0.5">
      {Object.entries(value).map(([k, v]) => {
        const simple = formatValue(k, v);
        return (
          <div key={k} className="text-slate-800">
            <span className="text-slate-500">{fieldLabel(k)}: </span>
            {simple ?? JSON.stringify(v)}
          </div>
        );
      })}
    </div>
  );
};

const LogChangesList = ({ body }) => {
  if (!body || typeof body !== "object") {
    return (
      <p className="text-sm text-slate-400">
        Bu amalda o'zgartirilgan ma'lumot yo'q
      </p>
    );
  }

  // Juda katta body kesilgan bo'lsa, middleware {truncated:true} qaytaradi
  if (body.truncated) {
    return (
      <p className="text-sm text-slate-500">
        Ma'lumot juda katta bo'lgani uchun saqlanmadi ({body.size} bayt)
      </p>
    );
  }

  const entries = Object.entries(body);
  if (entries.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Bu amalda o'zgartirilgan ma'lumot yo'q
      </p>
    );
  }

  return (
    <dl className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
      {entries.map(([key, value]) => {
        const simple = formatValue(key, value);
        return (
          <div
            key={key}
            className="grid grid-cols-3 gap-3 bg-white px-3 py-2.5 text-sm"
          >
            <dt className="text-slate-500">{fieldLabel(key)}</dt>
            <dd className="col-span-2 break-words text-slate-800">
              {simple !== null ? simple : renderComplex(key, value)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
};

export default LogChangesList;
