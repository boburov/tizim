import { Ban, UserX } from "lucide-react";
import { cn } from "@/shared/utils/cn";

const nameOf = (s) => `${s.firstName || ""} ${s.lastName || ""}`.trim() || "-";

// Ro'yxatda nechta ism ko'rsatiladi. Qolgani "+N ta" bo'lib yig'iladi:
// 40 kishilik ro'yxat ogohlantirishni ogohlantirish bo'lishdan to'xtatardi.
const NAME_LIMIT = 6;

const NameList = ({ students = [] }) => {
  if (!students.length) return null;
  const shown = students.slice(0, NAME_LIMIT).map(nameOf);
  const rest = students.length - shown.length;
  return (
    <p className="mt-1 text-xs opacity-90">
      {shown.join(", ")}
      {rest > 0 && ` +${rest} ta`}
    </p>
  );
};

const Row = ({ icon: Icon, tone, title, students }) => (
  <div className={cn("flex gap-2 rounded-md border p-2.5 text-sm", tone)}>
    <Icon className="mt-0.5 size-4 shrink-0" />
    <div className="min-w-0">
      <p className="font-medium">{title}</p>
      <NameList students={students} />
    </div>
  </div>
);

/**
 * BOTNI BLOKLAGANLAR OGOHLANTIRISHI.
 *
 * Yuborishdan OLDIN ko'rsatiladi - keyin emas. Sabab: fayl bir marta
 * ketgach o'qituvchi kimga yetmaganini bilib olsa ham, qayta yuborishdan
 * boshqa chorasi qolmaydi. Oldindan bilsa, darsda aytib qo'yishi mumkin.
 */
const BlockedWarning = ({ preview, className = "" }) => {
  if (!preview) return null;

  const { blocked = 0, noBot = 0, blockedStudents = [], noBotStudents = [] } =
    preview;

  if (!blocked && !noBot) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {blocked > 0 && (
        <Row
          icon={Ban}
          tone="border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
          title={`${blocked} ta o'quvchi botni bloklagan - ularga yetib bormaydi`}
          students={blockedStudents}
        />
      )}
      {noBot > 0 && (
        <Row
          icon={UserX}
          tone="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
          title={`${noBot} ta o'quvchi botga kirmagan - ularga yetib bormaydi`}
          students={noBotStudents}
        />
      )}
    </div>
  );
};

export default BlockedWarning;
