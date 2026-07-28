// Router
import { useNavigate } from "react-router-dom";

// Icons
import { Plus } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import RolesList from "../components/RolesList";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import { useRolesQuery, useRolesMatrixQuery } from "../hooks/useRolesQuery";

// Utils
import { cn } from "@/shared/utils/cn.js";

const TABS = [
  { key: "system", label: "Tizim rollari" },
  { key: "custom", label: "Custom rollar" },
];

// Rollar ro'yxati. Tahrirlash alohida sahifada (/roles/:value) - ilgari
// u yon panelda edi va ruxsatlar jadvaliga joy qolmasdi.
const RolesPage = () => {
  const navigate = useNavigate();

  const ui = useObjectState({ tab: "system" });
  const { tab, setField } = ui;

  const { data: roles = [], isLoading, isError, refetch } = useRolesQuery();
  // Ruxsat sonini ko'rsatish uchun matritsa oldindan yuklanadi - shunda
  // tahrirlash sahifasi ochilganda kutish bo'lmaydi.
  useRolesMatrixQuery();

  const visibleRoles = roles.filter((r) =>
    tab === "system" ? r.isSystem : !r.isSystem,
  );

  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Rollar va ruxsatlar</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Har bir rol tizimning qaysi qismlariga kira olishini belgilaydi
          </p>
        </div>
        <Button onClick={() => navigate("/owner/roles/new")}>
          <Plus className="mr-1.5 size-4" />
          Yangi rol
        </Button>
      </header>

      {/* Tizim / Custom rollar */}
      <div className="inline-flex rounded-lg bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setField("tab", t.key)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Yuklanmoqda...
        </p>
      ) : (
        <RolesList
          roles={visibleRoles}
          onSelect={(v) => navigate(`/owner/roles/${v}`)}
        />
      )}
    </div>
  );
};

export default RolesPage;
