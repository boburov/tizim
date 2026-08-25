// React
import { useState } from "react";

// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import CoinAmount from "@/shared/components/coin/CoinAmount";
import OrderStatusBadge, {
  ORDER_STATUS_META,
} from "@/shared/components/coin/OrderStatusBadge";

// Mutations
import { useOrderStatusMutation } from "../../hooks/useMarketMutations";

/**
 * ══════════════════════════════════════════════════════════════════════
 * BUYURTMA HOLATINI SILJITISH
 * ══════════════════════════════════════════════════════════════════════
 *
 * ⚠ GRAF SERVER BILAN AYNAN BIR XIL
 * (`server/src/common/constants/coin.ts` → `MARKET_ORDER_TRANSITIONS`).
 *
 * Ikki nusxa saqlashning sababi: klientda faqat MUMKIN bo'lgan tugmalar
 * chiqishi kerak. Hammasi ko'rsatilsa administrator «Topshirildi» dan
 * «Rad etildi» ga o'tmoqchi bo'lib, 400 xatoga urilardi — va nega
 * bo'lmasligini ekran aytmasdi.
 *
 * ⚠ YAKUNIY HOLATLAR (`delivered`, `rejected`, `canceled`) DAN CHIQISH
 * YO'LI YO'Q. Bu ataylab: `rejected` → `approved` tanga qaytarilgandan
 * KEYIN mahsulotni ham berish, ya'ni ikki marta to'lash degani bo'lardi.
 */
const TRANSITIONS = Object.freeze({
  pending: ["approved", "rejected"],
  approved: ["ready", "delivered", "rejected"],
  ready: ["delivered", "rejected"],
  delivered: [],
  rejected: [],
  canceled: [],
});

/** Tanga QAYTARILADIGAN holatlar — server bilan bir xil. */
const REFUNDING = ["rejected", "canceled"];

const OrderStatusModal = ({ close, isLoading, setIsLoading, order }) => {
  const [adminNote, setAdminNote] = useState(order?.adminNote || "");
  const [target, setTarget] = useState(null);

  const { mutate } = useOrderStatusMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const next = TRANSITIONS[order?.status] || [];

  const apply = (status) => {
    setTarget(status);
    setIsLoading(true);
    mutate({ id: order._id, body: { status, adminNote: adminNote.trim() } });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-medium">{order?.productName}</span>
          <CoinAmount value={order?.priceCoins} size="sm" showLabel={false} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Hozirgi holat:</span>
          <OrderStatusBadge status={order?.status} />
        </div>
        {order?.note && (
          <p className="text-xs text-muted-foreground">
            O'quvchi izohi: {order.note}
          </p>
        )}
        {order?.deliveryInfo && (
          <p className="text-xs text-muted-foreground">
            Yetkazish sharti: {order.deliveryInfo}
          </p>
        )}
      </div>

      {next.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Bu buyurtma yakunlangan — holatini o'zgartirib bo'lmaydi. Xato
          bo'lsa o'quvchi yangi buyurtma berishi mumkin.
        </p>
      ) : (
        <>
          <InputField
            name="adminNote"
            label="Izoh"
            description="O'quvchiga yuboriladigan xabarga qo'shiladi"
            placeholder="Masalan: ertaga qabulxonadan olib keting"
            maxLength={200}
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            disabled={isLoading}
          />

          <div className="space-y-2">
            {next.map((status) => {
              const meta = ORDER_STATUS_META[status];
              const refunds = REFUNDING.includes(status);
              return (
                <Button
                  key={status}
                  type="button"
                  variant={refunds ? "outline" : "default"}
                  className="w-full justify-start"
                  onClick={() => apply(status)}
                  disabled={isLoading}
                >
                  {meta?.icon && <meta.icon className="size-4" />}
                  {isLoading && target === status ? "Saqlanmoqda..." : meta?.label}
                  {refunds && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      tanga qaytariladi
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </>
      )}

      <Button
        type="button"
        variant="ghost"
        onClick={() => close?.()}
        disabled={isLoading}
        className="w-full"
      >
        Yopish
      </Button>
    </div>
  );
};

export default OrderStatusModal;
