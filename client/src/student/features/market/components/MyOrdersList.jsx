// Icons
import { ShoppingBag, Info } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import EmptyState from "@/shared/components/page/EmptyState";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";
import CoinAmount from "@/shared/components/coin/CoinAmount";
import OrderStatusBadge from "@/shared/components/coin/OrderStatusBadge";

// Utils
import { formatDateUz } from "@/shared/utils/formatDate";

/**
 * BUYURTMALARIM.
 *
 * ── UCHTA SAVOLGA JAVOB BERADI (talab) ──
 *   1. Nima oldim va necha tangaga
 *   2. QANDAY olaman        → `deliveryInfo`
 *   3. QACHON yetadi        → `expectedAt`
 *
 * Uchalasi ham BUYURTMADAN olinadi, mahsulotdan emas: mahsulot
 * keyin o'zgargan bo'lsa ham o'quvchiga xarid PAYTIDA aytilgan
 * shart ko'rinishi kerak. Aks holda "menga boshqacha aytilgandi"
 * degan holat yuzaga kelardi va uni tekshirib bo'lmasdi.
 */
const MyOrdersList = ({ items, isLoading, onCancel, cancelingId }) => {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Hali hech narsa olmagansiz"
        hint="Darsga qatnashing va yaxshi baho oling — to'plangan tangani do'kondan sovg'aga almashtirasiz."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((order) => (
        <li
          key={order._id}
          className="space-y-2 rounded-xl border border-border bg-card p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">
                {order.productName}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateUz(order.createdAt)}
              </p>
            </div>
            <CoinAmount value={order.priceCoins} size="sm" showLabel={false} />
          </div>

          <OrderStatusBadge status={order.status} />

          {/* QANDAY OLAMAN — yakunlangan/bekor qilinganida ma'nosiz. */}
          {order.deliveryInfo &&
            !["rejected", "canceled"].includes(order.status) && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                {order.deliveryInfo}
              </p>
            )}

          {/* QACHON YETADI — faqat hali yo'ldagi buyurtmada. */}
          {order.expectedAt &&
            ["pending", "approved"].includes(order.status) && (
              <p className="text-xs text-muted-foreground">
                Taxminan <b>{formatDateUz(order.expectedAt)}</b> gacha tayyor bo'ladi
              </p>
            )}

          {order.adminNote && (
            <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
              {order.adminNote}
            </p>
          )}

          {/* Bekor qilish FAQAT tasdiqdan oldin — keyin mahsulot
              allaqachon tayyorlanayotgan bo'lishi mumkin. */}
          {order.status === "pending" && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => onCancel(order)}
              disabled={cancelingId === order._id}
            >
              {cancelingId === order._id ? "Bekor qilinmoqda..." : "Bekor qilish"}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
};

export default MyOrdersList;
