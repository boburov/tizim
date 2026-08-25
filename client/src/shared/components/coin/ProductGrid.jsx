// Icons
import { Package, Clock, Truck } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import EmptyState from "@/shared/components/page/EmptyState";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";
import CoinAmount from "./CoinAmount";

/**
 * DO'KON VITRINASI — O'QUVCHI KO'RINISHI.
 *
 * ── NEGA "YETMAYDI" TUGMASI O'CHIRILADI, YASHIRILMAYDI ──
 * Mahsulot ko'rinib turishi kerak: aynan u o'quvchiga darsga kelish
 * uchun sabab beradi. Yashirilsa maqsad ham yo'qolardi. Shuning
 * uchun karta qoladi, tugma esa "Yana N kerak" deb aytadi — ya'ni
 * masofani ANIQ raqamda ko'rsatadi.
 *
 * ── ZAXIRA UCH XIL ──
 * `inStock` ni server hisoblaydi (`stock === null || stock > 0`) —
 * klient `null` (cheksiz) va `0` (tugagan) ni qayta ajratmaydi, aks
 * holda ikkinchi ta'rif paydo bo'lardi.
 *
 * ── `readOnly` — O'QITUVCHI KO'RINISHI ──
 * O'qituvchi katalogni "o'quvchilarim nima uchun harakat qiladi" deb
 * ochadi, xarid qilish uchun EMAS. Uning hisobi bo'sh, ya'ni odatiy
 * ko'rinishda har mahsulotda "Yana 50 kerak" chiqardi — bu unga
 * hech narsa aytmaydigan, hatto chalg'ituvchi yozuv. `readOnly` da
 * tugma umuman chizilmaydi.
 */
const ProductGrid = ({ items, balance, isLoading, onBuy, readOnly = false }) => {
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <EmptyState
        icon={Package}
        title="Do'kon hozircha bo'sh"
        hint="Tangalaringiz saqlanib turadi. Mahsulotlar qo'shilishi bilan ularni shu yerda almashtira olasiz."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((product) => {
        const affordable = product.affordable && product.inStock;
        const missing = Math.max(0, Number(product.price) - Number(balance || 0));


        return (
          <article
            key={product._id}
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
          >
            <div className="flex h-32 items-center justify-center bg-muted">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt=""
                  className="size-full object-cover"
                  loading="lazy"
                />
              ) : (
                <Package className="size-8 text-muted-foreground" strokeWidth={1.5} />
              )}
            </div>

            <div className="flex flex-1 flex-col gap-2 p-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-medium text-foreground">{product.name}</h3>
                {product.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {product.description}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {!product.inStock && <StatusBadge tone="danger">Qolmagan</StatusBadge>}
                {product.deliveryDays > 0 ? (
                  <StatusBadge tone="neutral" icon={Clock}>
                    {product.deliveryDays} kunda
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="neutral" icon={Truck}>
                    Darhol
                  </StatusBadge>
                )}
              </div>

              {product.deliveryInfo && (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {product.deliveryInfo}
                </p>
              )}

              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                <CoinAmount value={product.price} showLabel={false} />
                {!readOnly && (
                  <Button
                    size="sm"
                    onClick={() => onBuy(product)}
                    disabled={!affordable}
                    variant={affordable ? "default" : "outline"}
                  >
                    {!product.inStock
                      ? "Qolmagan"
                      : affordable
                        ? "Olish"
                        : `Yana ${missing.toLocaleString("uz-UZ")} kerak`}
                  </Button>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default ProductGrid;
