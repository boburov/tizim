import Card from "@/shared/components/ui/card/Card";
import { formatMonths } from "../utils/formatMonths";

// Qaysi o'qituvchining o'quvchilari ko'proq chiqib ketyapti + sabablari.
// count bo'yicha kamayuvchi (eng muammoli o'qituvchi yuqorida).
const TeacherChurnTable = ({ teachers = [] }) => (
  <Card title="O'qituvchilar bo'yicha chiqib ketish">
    {teachers.length === 0 ? (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Ma'lumot yo'q
      </p>
    ) : (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className="px-2 py-2 font-medium">O'qituvchi</th>
              <th className="px-2 py-2 font-medium text-right">Chiqqan</th>
              <th className="px-2 py-2 font-medium text-right">O'rtacha muddat</th>
              <th className="px-2 py-2 font-medium">Asosiy sabablar</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t, i) => (
              <tr
                key={t.teacherId || `none-${i}`}
                className="border-b last:border-0"
              >
                <td className="px-2 py-2.5 font-medium text-foreground/90">
                  {t.teacherName}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">
                    {t.churnedCount}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right text-muted-foreground">
                  {formatMonths(t.avgDurationMonths)}
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {t.topReasons?.length ? (
                      t.topReasons.map((r) => (
                        <span
                          key={r.title}
                          className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                        >
                          {r.title} · {r.count}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-zinc-400">-</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </Card>
);

export default TeacherChurnTable;
