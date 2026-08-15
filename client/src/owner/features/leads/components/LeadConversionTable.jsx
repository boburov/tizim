// Components
import DataTable from "@/shared/components/ui/table/DataTable";

// Hooks
import { useLeadConversionQuery } from "../hooks/useLeadRouting";

const pctText = (v) => (v === null || v === undefined ? "—" : `${v}%`);

const th = "px-4 py-2.5 text-left font-medium text-muted-foreground";

/**
 * KONVERSIYA TAQQOSLASH - filial va xodim kesimida.
 *
 * IKKI JADVAL, chunki ular BOSHQA savolga javob beradi:
 *   filial  - "qaysi filial yaxshiroq ishlayapti"
 *   xodim   - "kim yaxshiroq ishlayapti"
 *
 * Ikkinchisi muhimroq: filial ko'rsatkichi bir necha odamning
 * yig'indisi va u yomon bo'lsa ham sababi noma'lum qoladi.
 *
 * MANBA `statusHistory` - joriy status emas. O'quvchiga aylangan lid
 * keyin arxivlansa ham konversiya hisobidan tushib qolmasligi kerak.
 */
const LeadConversionTable = ({ from, to }) => {
  const params = {};
  if (from) params.from = from;
  if (to) params.to = to;

  const { data, isLoading } = useLeadConversionQuery(params);

  const columns = (labelHeader) => [
    {
      key: "name",
      header: labelHeader,
      headerClassName: th,
      cell: (r) => <span className="text-sm font-medium">{r.name}</span>,
    },
    {
      key: "total",
      header: "Jami lid",
      headerClassName: th,
      cell: (r) => <span className="text-sm tabular-nums">{r.total}</span>,
    },
    {
      key: "enrolled",
      header: "Yozildi",
      headerClassName: th,
      cell: (r) => (
        <span className="text-sm tabular-nums text-emerald-700 dark:text-emerald-300">
          {r.enrolled}
        </span>
      ),
    },
    {
      key: "open",
      header: "Ishlanmoqda",
      headerClassName: th,
      cell: (r) => <span className="text-sm tabular-nums">{r.open}</span>,
    },
    {
      key: "rejected",
      header: "Rad etildi",
      headerClassName: th,
      cell: (r) => <span className="text-sm tabular-nums">{r.rejected}</span>,
    },
    {
      key: "conv",
      header: "Konversiya",
      headerClassName: th,
      cell: (r) => (
        <span className="text-sm font-semibold tabular-nums">
          {pctText(r.conversionPercent)}
        </span>
      ),
    },
  ];

  const branches = data?.branches || [];
  const assignees = data?.assignees || [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Konversiya — filiallar</h3>
        {data?.totals && (
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            Jami {data.totals.total} lid · {data.totals.enrolled} yozildi ·
            umumiy konversiya {pctText(data.totals.conversionPercent)}
          </p>
        )}
        <div className="mt-2">
          <DataTable
            rows={branches}
            columns={columns("Filial")}
            isLoading={isLoading}
            empty={
              <p className="py-6 text-center text-sm opacity-60">
                Bu davrda lid yo'q
              </p>
            }
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium">Konversiya — xodimlar</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Biriktirilmagan lidlar bu jadvalga kirmaydi — «hech kim»ni
          konversiya bo'yicha baholab bo'lmaydi. Filial jadvalida esa ular
          sanaladi, aks holda filial ko'rsatkichi yaxshiroq ko'rinardi.
        </p>
        <div className="mt-2">
          <DataTable
            rows={assignees}
            columns={columns("Xodim")}
            isLoading={isLoading}
            empty={
              <p className="py-6 text-center text-sm opacity-60">
                Biriktirilgan lid yo'q
              </p>
            }
          />
        </div>
      </div>
    </div>
  );
};

export default LeadConversionTable;
