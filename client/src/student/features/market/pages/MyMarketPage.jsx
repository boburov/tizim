// React
import { useState } from "react";

// Icons
import { Store, ShoppingBag } from "lucide-react";

// Components
import WorkspacePage from "@/shared/components/page/PageShell";
import TabNav from "@/shared/components/page/TabNav";
import { useActiveTab } from "@/shared/components/page/tabState";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import EmptyState from "@/shared/components/page/EmptyState";
import CoinAmount from "@/shared/components/coin/CoinAmount";

// Hooks
import useModal from "@/shared/hooks/useModal";
import useCoinConfig from "@/shared/hooks/useCoinConfig";

// Constants
import { MODAL } from "@/shared/constants/modals";

// Feature
import ProductGrid from "@/shared/components/coin/ProductGrid";
import MyOrdersList from "../components/MyOrdersList";
import BuyConfirmModal from "../components/modals/BuyConfirmModal";
import {
  useMarketCatalogQuery,
  useMyOrdersQuery,
} from "../hooks/useStudentMarketQueries";
import { useCancelOrderMutation } from "../hooks/useStudentMarketMutations";

/**
 * O'QUVCHI MARKETI.
 *
 * ── BALANS SARLAVHADA ──
 * "Menda nechta bor" — do'konga kirgan odamning birinchi savoli. U
 * har mahsulot yonida takrorlansa shovqin bo'lardi, alohida sahifada
 * bo'lsa esa har safar u yerga borib kelish kerak edi.
 *
 * ── DO'KON YOPIQ BO'LSA ──
 * Ega faqat marketni yopishi mumkin (tanga to'planishda davom etadi).
 * O'shanda sahifa 404 bermaydi va bo'sh ham qolmaydi — nima
 * bo'layotganini AYTADI. "Xatolik" ekrani bu yerda yolg'on bo'lardi.
 */
const MyMarketPage = () => {
  const { openModal } = useModal();
  const { marketEnabled, coinLabel } = useCoinConfig();
  const [cancelingId, setCancelingId] = useState(null);

  const tabs = [
    { key: "shop", label: "Do'kon", icon: Store },
    { key: "orders", label: "Buyurtmalarim", icon: ShoppingBag },
  ];
  const active = useActiveTab(tabs);

  const catalog = useMarketCatalogQuery({ limit: 60 });
  const orders = useMyOrdersQuery({ limit: 50 });

  const balance = catalog.data?.meta?.balance ?? 0;

  const { mutate: cancelOrder } = useCancelOrderMutation({
    onSuccess: () => setCancelingId(null),
    onError: () => setCancelingId(null),
  });

  const handleCancel = (order) => {
    setCancelingId(order._id);
    cancelOrder(order._id);
  };

  return (
    <WorkspacePage
      title="Market"
      subtitle={`To'plagan ${coinLabel}ingizni sovg'aga almashtiring`}
      actions={<CoinAmount value={balance} size="md" />}
    >
      <TabNav tabs={tabs} />

      {active === "shop" &&
        (!marketEnabled ? (
          <EmptyState
            icon={Store}
            title="Do'kon vaqtincha yopiq"
            hint={`Tangalaringiz saqlanib turibdi va to'planishda davom etadi. Do'kon ochilishi bilan ularni sarflashingiz mumkin bo'ladi.`}
          />
        ) : catalog.isError ? (
          <ErrorState onRetry={catalog.refetch} />
        ) : (
          <ProductGrid
            items={catalog.data?.data || []}
            balance={balance}
            isLoading={catalog.isLoading}
            onBuy={(product) => openModal(MODAL.MARKET_BUY, { product, balance })}
          />
        ))}

      {active === "orders" &&
        (orders.isError ? (
          <ErrorState onRetry={orders.refetch} />
        ) : (
          <MyOrdersList
            items={orders.data?.data || []}
            isLoading={orders.isLoading}
            onCancel={handleCancel}
            cancelingId={cancelingId}
          />
        ))}

      <ModalWrapper
        name={MODAL.MARKET_BUY}
        title="Xaridni tasdiqlang"
        description="Tanga darhol yechiladi"
      >
        <BuyConfirmModal />
      </ModalWrapper>
    </WorkspacePage>
  );
};

export default MyMarketPage;
