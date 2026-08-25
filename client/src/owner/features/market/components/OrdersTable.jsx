// Icons
import { ShoppingBag, ChevronRight } from "lucide-react";

// Components
import DataTable from "@/shared/components/ui/table/DataTable";
import Button from "@/shared/components/ui/button/Button";
import EmptyState from "@/shared/components/page/EmptyState";
import CoinAmount from "@/shared/components/coin/CoinAmount";
import OrderStatusBadge from "@/shared/components/coin/OrderStatusBadge";

// Utils
import { formatDateUz } from "@/shared/utils/formatDate";

const fullName = (u) =>
  `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || "—";

/**
 * KUTAYOTGAN BUYURTMALAR JADVALI.
 *
 * ⚠ NARX BUYURTMADAN OLINADI (`priceCoins`), MAHSULOTDAN EMAS.
 * Mahsulot narxi keyin o'zgargan bo'lsa ham, administrator o'quvchi
 * HAQIQATDA to'lagan miqdorni ko'rishi kerak — aks holda rad etishda
 * qancha tanga qaytarilganini tushuntirib bo'lmasdi.
 */
const OrdersTable = ({ items, isLoading, onOpen, canFulfill }) => {
  const columns = [
    {
      key: "student",
      header: "O'quvchi",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{fullName(row.user)}</p>
          {row.user?.phone && (
            <p className="truncate text-xs text-muted-foreground">{row.user.phone}</p>
          )}
        </div>
      ),
    },
    {
      key: "product",
      header: "Mahsulot",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate">{row.productName}</p>
          {row.note && (
            <p className="truncate text-xs text-muted-foreground">Izoh: {row.note}</p>
          )}
        </div>
      ),
    },
    {
      key: "price",
      header: "Narx",
      cell: (row) => <CoinAmount value={row.priceCoins} showLabel={false} />,
    },
    {
      key: "status",
      header: "Holat",
      cell: (row) => <OrderStatusBadge status={row.status} />,
    },
    {
      key: "date",
      header: "Sana",
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDateUz(row.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (row) =>
        canFulfill ? (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => onOpen(row)}>
              Boshqarish
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      isLoading={isLoading}
      rowKey={(r) => r._id}
      renderCard={(row) => (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{fullName(row.user)}</p>
              <p className="truncate text-xs text-muted-foreground">{row.productName}</p>
            </div>
            <CoinAmount value={row.priceCoins} size="sm" showLabel={false} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <OrderStatusBadge status={row.status} />
            <span className="text-xs text-muted-foreground">
              {formatDateUz(row.createdAt)}
            </span>
          </div>
          {canFulfill && (
            <Button size="sm" variant="outline" className="w-full" onClick={() => onOpen(row)}>
              Boshqarish
            </Button>
          )}
        </div>
      )}
      empty={
        <EmptyState
          icon={ShoppingBag}
          title="Hozircha buyurtma yo'q"
          hint="O'quvchi marketdan mahsulot tanlaganda buyurtma shu yerda paydo bo'ladi va tasdiqlashingizni kutadi."
        />
      }
    />
  );
};

export default OrdersTable;
