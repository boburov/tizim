// React
import { useState } from "react";

// Icons
import { Package, ShoppingBag, Settings2, Plus } from "lucide-react";

// Components
import WorkspacePage from "@/shared/components/page/PageShell";
import TabNav from "@/shared/components/page/TabNav";
import { useActiveTab } from "@/shared/components/page/tabState";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";

// Hooks
import useModal from "@/shared/hooks/useModal";
import usePermissions from "@/shared/hooks/usePermissions";
import useDebounce from "@/shared/hooks/useDebounce";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { PERMISSIONS } from "@/shared/constants/permissions";

// Feature
import CoinEconomySection from "../components/CoinEconomySection";
import ProductsTable from "../components/ProductsTable";
import OrdersTable from "../components/OrdersTable";
import CoinSettingsForm from "../components/CoinSettingsForm";
import ProductFormModal from "../components/modals/ProductFormModal";
import ProductDeleteModal from "../components/modals/ProductDeleteModal";
import OrderStatusModal from "../components/modals/OrderStatusModal";
import {
  useMarketProductsQuery,
  useMarketOrdersQuery,
  useCoinStatsQuery,
  useCoinSettingsQuery,
} from "../hooks/useMarketQueries";

const STATUS_FILTERS = [
  { key: "", label: "Hammasi" },
  { key: "pending", label: "Kutilmoqda" },
  { key: "approved", label: "Tasdiqlangan" },
  { key: "ready", label: "Tayyor" },
  { key: "delivered", label: "Topshirilgan" },
];

/**
 * ══════════════════════════════════════════════════════════════════════
 * MARKET — BITTA SAHIFA, IKKI QOBIQ
 * ══════════════════════════════════════════════════════════════════════
 *
 * Bu sahifa Admin panelida (`/owner/market`) ham, Super Admin panelida
 * (`/org/market`) ham AYNI komponent bilan chiziladi. Ikkinchi nusxa
 * yozilmadi: xona va moliya ekranlaridagi bilan bir xil qoida —
 * ko'lam SERVER qo'yadigan filtr, ikkinchi ekran emas. Nusxa
 * yaratilsa bir xil savolga ikki xil javob paydo bo'lardi.
 *
 * Farq faqat MA'LUMOTDA: filial administratori o'z filialining
 * mahsulot va buyurtmalarini ko'radi, ega esa hammasini.
 *
 * ── SOZLAMALAR TABI FAQAT EGADA ──
 * `coin.settings` — owner-only ruxsat (butun bo'limni o'chirish
 * tugmasi). Tab ruxsatsiz odamga KO'RSATILMAYDI, lekin bu qulaylik:
 * server ham AYNI kalitni talab qiladi.
 */
const MarketPage = () => {
  const { has } = usePermissions();
  const { openModal } = useModal();

  const canRead = has(PERMISSIONS.MARKET_READ);
  const canManage = has(PERMISSIONS.MARKET_MANAGE);
  const canFulfill = has(PERMISSIONS.MARKET_FULFILL);
  const canSettings = has(PERMISSIONS.COIN_SETTINGS);
  const canSeeStats = has(PERMISSIONS.COIN_READ);

  // ⚠ SERVER TALABI BILAN AYNI BO'LISHI SHART (`market.controller.ts`):
  //   GET /market/products — `market.read` YOKI `market.manage`
  //   GET /market/orders   — `market.read` YOKI `market.fulfill`
  // Marshrut qo'riqchisi uchtasidan BIRINI yetarli deb biladi, ya'ni
  // `market.fulfill` li odam sahifaga kiradi-yu, mahsulotlar so'rovida
  // 403 olardi.
  const canSeeProducts = canRead || canManage;
  const canSeeOrders = canRead || canFulfill;

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [status, setStatus] = useState("");
  // Grafik davri — sahifa darajasida, chunki uni so'rov ham,
  // boshqaruv qatori ham o'qiydi.
  const [statsDays, setStatsDays] = useState(30);

  const tabs = [
    { key: "products", label: "Mahsulotlar", icon: Package, visible: canSeeProducts },
    { key: "orders", label: "Buyurtmalar", icon: ShoppingBag, visible: canSeeOrders },
    { key: "settings", label: "Sozlamalar", icon: Settings2, visible: canSettings },
  ];
  const active = useActiveTab(tabs);

  // ═══════════════════════════════════════════════════════════════════
  // SO'ROVLAR — `enabled` BILAN: TAB OCHIQMI **VA** RUXSAT BORMI.
  //
  // ⚠ TAB'NI YASHIRISH YETARLI EMAS. Ilgari to'rttala so'rov sahifa
  // ochilishi bilan SHARTSIZ yurardi: "Sozlamalar" tabi to'g'ri
  // yashirilgan bo'lsa ham `GET /coins/settings` baribir jo'natilardi,
  // server `coin.settings` (owner-only) talab qilib 403 qaytarardi va
  // global `QueryCache.onError` qizil "Ruxsat etilmagan" tostini
  // chiqarardi — foydalanuvchi hech nima bosmagan bo'lsa ham.
  //
  // Naqsh `SystemAnalysisTabs` dan olindi: u ham `visible`, ham
  // `enabled` ni ishlatadi. Ruxsat SHARTNING BIR QISMI bo'lishi shart —
  // yolg'iz `active === "settings"` bo'lsa, `?tab=settings` yozgan
  // odam yana 403 olardi.
  const products = useMarketProductsQuery(
    { search: debouncedSearch || undefined, includeInactive: true, limit: 100 },
    { enabled: active === "products" && canSeeProducts },
  );
  const orders = useMarketOrdersQuery(
    { status: status || undefined, limit: 100 },
    { enabled: active === "orders" && canSeeOrders },
  );
  const stats = useCoinStatsQuery(statsDays, { enabled: canSeeStats });
  const settings = useCoinSettingsQuery({
    enabled: active === "settings" && canSettings,
  });

  const openCreate = () => openModal(MODAL.MARKET_PRODUCT_FORM, { product: null });

  return (
    <WorkspacePage
      title="Market"
      actions={
        active === "products" && canManage ? (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Mahsulot
          </Button>
        ) : null
      }
    >
      {canSeeStats && (
        <CoinEconomySection
          stats={stats.data}
          isLoading={stats.isLoading}
          isError={stats.isError}
          onRetry={stats.refetch}
          range={statsDays}
          onRangeChange={setStatsDays}
        />
      )}

      <TabNav tabs={tabs} />

      {/* ═══ MAHSULOTLAR ═══ */}
      {active === "products" && (
        <div className="space-y-4">
          <div className="sm:max-w-xs">
            <InputField
              type="search"
              name="search"
              placeholder="Mahsulot nomi..."
              maxLength={120}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {products.isError ? (
            <ErrorState onRetry={products.refetch} />
          ) : (
            /* ⚠ TAHRIRLASH/O'CHIRISH ham `market.manage` ostida.
               Ilgari faqat `onCreate` tekshirilardi, `onEdit`/`onDelete`
               esa DOIM uzatilardi — `ProductsTable` ularni shartsiz
               chizardi va `market.read` li odam bosganda 403 olardi
               (`PATCH/DELETE /market/products/:id`). `OrdersTable`
               shu ishni allaqachon to'g'ri qiladi (`canFulfill`). */
            <ProductsTable
              items={products.data?.data || []}
              isLoading={products.isLoading}
              onEdit={
                canManage
                  ? (product) => openModal(MODAL.MARKET_PRODUCT_FORM, { product })
                  : undefined
              }
              onDelete={
                canManage
                  ? (product) => openModal(MODAL.MARKET_PRODUCT_DELETE, { product })
                  : undefined
              }
              onCreate={canManage ? openCreate : undefined}
            />
          )}
        </div>
      )}

      {/* ═══ BUYURTMALAR ═══ */}
      {active === "orders" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 overflow-x-auto rounded-lg bg-muted p-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key || "all"}
                type="button"
                onClick={() => setStatus(f.key)}
                aria-current={status === f.key ? "true" : undefined}
                className={
                  status === f.key
                    ? "rounded-md bg-card px-3 py-1.5 text-sm font-medium shadow-sm"
                    : "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                }
              >
                {f.label}
              </button>
            ))}
          </div>

          {orders.isError ? (
            <ErrorState onRetry={orders.refetch} />
          ) : (
            <OrdersTable
              items={orders.data?.data || []}
              isLoading={orders.isLoading}
              canFulfill={canFulfill}
              onOpen={(order) => openModal(MODAL.MARKET_ORDER_STATUS, { order })}
            />
          )}
        </div>
      )}

      {/* ═══ SOZLAMALAR (faqat ega) ═══ */}
      {active === "settings" && canSettings && (
        <CoinSettingsForm settings={settings.data} isLoading={settings.isLoading} />
      )}

      {/* ── MODALLAR ──
          ⚠ SAHIFA DARAJASIDA, BIR MARTA. Ular `AppSidebar` dagi
          `CreateModals` ga QO'SHILMAYDI: bir xil `name` bilan ikki
          joyda mount qilinsa bitta `openModal` IKKITA oyna ochardi. */}
      <ModalWrapper
        name={MODAL.MARKET_PRODUCT_FORM}
        title="Mahsulot"
        description="O'quvchi buni tangaga almashtiradi"
      >
        <ProductFormModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.MARKET_PRODUCT_DELETE} title="Mahsulotni o'chirish">
        <ProductDeleteModal />
      </ModalWrapper>
      <ModalWrapper name={MODAL.MARKET_ORDER_STATUS} title="Buyurtma">
        <OrderStatusModal />
      </ModalWrapper>
    </WorkspacePage>
  );
};

export default MarketPage;
