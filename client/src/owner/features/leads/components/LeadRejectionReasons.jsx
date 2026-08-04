import Card from "@/shared/components/ui/card/Card";

// RAD ETISH SABABLARI - "nega mijozlar kelmayapti?"
//
// Voronka (LeadDropOff) QAYERDA yo'qotayotganini ko'rsatadi, bu kartochka
// esa NEGA ekanini. Ikkalasi birga o'qilishi kerak: "sinov darsidan keyin
// 12 ta ketdi" + "ulardan 8 tasi narx sababli" = aniq qaror.
const LeadRejectionReasons = ({ rows = [], rejection }) => {
  const total = rejection?.total || 0;
  const max = Math.max(1, ...rows.map((r) => r.count));
  const coverage = rejection?.noteCoverage ?? 0;

  return (
    <Card title="Rad etish sabablari" className="space-y-3">
      {total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Rad etilgan lidlar yo&apos;q
        </p>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            {rows.map((r) => (
              <div key={r.id || "none"} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span
                    className={
                      r.id ? "font-medium" : "font-medium text-muted-foreground"
                    }
                  >
                    {r.name}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {r.count} · {r.share}%
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full rounded bg-amber-500"
                    style={{ width: `${(r.count / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* MA'LUMOT SIFATI ko'rsatkichi.
              Sabab ro'yxatdan tanlanadi va ko'pincha "Boshqa" bo'lib qoladi -
              undan tahlil chiqmaydi. Haqiqiy sabab erkin izohda bo'ladi.
              Bu qator qancha yopilgan lidda izoh borligini ko'rsatadi, ya'ni
              yuqoridagi taqsimotga qanchalik ishonish mumkinligini. */}
          <div className="mt-3 border-t pt-3">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">Izoh yozilgan</span>
              <span
                className={
                  coverage >= 70
                    ? "font-medium text-emerald-600 dark:text-emerald-300"
                    : "font-medium text-amber-600 dark:text-amber-300"
                }
              >
                {coverage}%
              </span>
            </div>
            {coverage < 70 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Izohsiz yopilgan lidlardan sabab tahlili chiqmaydi. Yopishda
                &quot;mijoz nima dedi?&quot; maydonini to&apos;ldiring.
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
};

export default LeadRejectionReasons;
