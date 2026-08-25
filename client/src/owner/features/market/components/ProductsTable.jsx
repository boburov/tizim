// Icons
import { Package, Pencil, Trash2, Plus, Building2, Globe2 } from "lucide-react";

// Components
import DataTable from "@/shared/components/ui/table/DataTable";
import Button from "@/shared/components/ui/button/Button";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import EmptyState from "@/shared/components/page/EmptyState";
import CoinAmount from "@/shared/components/coin/CoinAmount";

/**
 * ZAXIRA UCH XIL BO'LADI — VA UCHALASI BOSHQACHA O'QILADI.
 *
 *   null  → CHEKSIZ (raqamli sovg'a, sertifikat)
 *   0     → TUGAGAN (ko'rinadi, lekin sotib bo'lmaydi)
 *   n     → qolgan dona
 *
 * `null` va `0` ni bir xil ko'rsatish eng qimmat xato bo'lardi:
 * cheksiz mahsulot "tugagan" deb o'qilib, administrator uni bekorga
 * to'ldirishga urinardi.
 */
const stockCell = (stock) => {
  if (stock === null || stock === undefined) {
    return <StatusBadge tone="info">Cheksiz</StatusBadge>;
  }
  if (Number(stock) <= 0) {
    return <StatusBadge tone="danger">Qolmagan</StatusBadge>;
  }
  return <span className="tabular-nums">{stock} dona</span>;
};

const ProductsTable = ({ items, isLoading, onEdit, onDelete, onCreate }) => {
  const columns = [
    {
      key: "name",
      header: "Mahsulot",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          {row.imageUrl ? (
            <img
              src={row.imageUrl}
              alt=""
              className="size-9 shrink-0 rounded-md border object-cover"
            />
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Package className="size-4" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.name}</p>
            {row.description && (
              <p className="truncate text-xs text-muted-foreground">
                {row.description}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "price",
      header: "Narx",
      cell: (row) => <CoinAmount value={row.price} showLabel={false} />,
    },
    { key: "stock", header: "Zaxira", cell: (row) => stockCell(row.stock) },
    {
      key: "delivery",
      header: "Yetkazish",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.deliveryDays > 0 ? `${row.deliveryDays} kun` : "Darhol"}
        </span>
      ),
    },
    {
      key: "scope",
      header: "Ko'lam",
      cell: (row) =>
        row.branchId ? (
          <StatusBadge tone="neutral" icon={Building2}>
            {row.branch?.name || "Filial"}
          </StatusBadge>
        ) : (
          <StatusBadge tone="info" icon={Globe2}>
            Butun markaz
          </StatusBadge>
        ),
    },
    {
      key: "state",
      header: "Holat",
      cell: (row) =>
        row.isActive ? (
          <StatusBadge tone="success">Faol</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Yashirilgan</StatusBadge>
        ),
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" onClick={() => onEdit(row)} aria-label="Tahrirlash">
            <Pencil className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onDelete(row)} aria-label="O'chirish">
            <Trash2 className="size-4 text-red-600 dark:text-red-400" />
          </Button>
        </div>
      ),
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
            <p className="min-w-0 flex-1 truncate font-medium">{row.name}</p>
            <CoinAmount value={row.price} size="sm" showLabel={false} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {stockCell(row.stock)}
            {row.isActive ? (
              <StatusBadge tone="success">Faol</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Yashirilgan</StatusBadge>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onEdit(row)}>
              Tahrirlash
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onDelete(row)}>
              O'chirish
            </Button>
          </div>
        </div>
      )}
      empty={
        <EmptyState
          icon={Package}
          title="Marketda hali mahsulot yo'q"
          hint="O'quvchilar tanga to'playdi, lekin sarflaydigan joyi bo'lmasa rag'bat ishlamaydi. Birinchi mahsulotni qo'shing — daftar, ruchka yoki sertifikat."
          action={
            onCreate && (
              <Button onClick={onCreate}>
                <Plus className="size-4" />
                Mahsulot qo'shish
              </Button>
            )
          }
        />
      }
    />
  );
};

export default ProductsTable;
