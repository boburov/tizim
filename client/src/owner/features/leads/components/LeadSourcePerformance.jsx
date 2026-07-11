import Card from "@/shared/components/ui/card/Card";

const LeadSourcePerformance = ({ rows = [] }) => (
  <Card title="Manba samaradorligi" className="space-y-3">
    {rows.length === 0 ? (
      <p className="mt-3 text-sm text-muted-foreground">Ma'lumot yo'q</p>
    ) : (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2">Manba</th>
              <th className="py-2 text-right">Lidlar</th>
              <th className="py-2 text-right">To'lov</th>
              <th className="py-2 text-right">Konversiya</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id || "none"}>
                <td className="py-2 font-medium">{r.name}</td>
                <td className="py-2 text-right">{r.total}</td>
                <td className="py-2 text-right text-green-600">{r.enrolled}</td>
                <td className="py-2 text-right font-medium">
                  {r.conversionRate}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </Card>
);

export default LeadSourcePerformance;
