// Router
import { useNavigate } from "react-router-dom";

// Toast
import { toast } from "sonner";

// Icons
import { Plus } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import ErrorState from "@/shared/components/ui/feedback/ErrorState";
import RolesList from "../components/RolesList";

// Hooks
import { useRolesQuery, useRolesMatrixQuery } from "../hooks/useRolesQuery";
import { useRoleFreezeMutation } from "../hooks/useRoleMutations";

// Rollar ro'yxati - tizim va custom rollar bitta ro'yxatda (serverda
// tizim rollari birinchi bo'lib saralanadi). Tahrirlash alohida sahifada
// (/roles/:value) - ilgari u yon panelda edi va ruxsatlar jadvaliga joy
// qolmasdi.
const RolesPage = () => {
  const navigate = useNavigate();

  const { data: roles = [], isLoading, isError, refetch } = useRolesQuery();
  // Ruxsat sonini ko'rsatish uchun matritsa oldindan yuklanadi - shunda
  // tahrirlash sahifasi ochilganda kutish bo'lmaydi.
  useRolesMatrixQuery();

  // Ro'yxatdagi bir bosishli muzlatish. Tasdiqlash oynasi yo'q, o'rniga
  // toast'da "Qaytarish" - noto'g'ri bosilsa darhol ortga qaytariladi.
  const {
    mutate: setFrozen,
    isPending,
    variables,
  } = useRoleFreezeMutation({
    silent: true,
    onSuccess: (data, vars) => {
      const message = vars.isFrozen
        ? `"${data.label}" muzlatildi - egalari tizimga kira olmaydi`
        : `"${data.label}" muzdan chiqarildi`;

      // Qaytarishning o'zi ham toast chiqaradi, lekin unda tugma yo'q -
      // aks holda cheksiz aylanaverar edi.
      toast.success(
        message,
        vars.isUndo
          ? undefined
          : {
              action: {
                label: "Qaytarish",
                onClick: () =>
                  setFrozen({
                    value: vars.value,
                    isFrozen: !vars.isFrozen,
                    isUndo: true,
                  }),
              },
            },
      );
    },
  });

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
        <Button onClick={() => navigate("/owner/settings/rollar/new")}>
          <Plus className="mr-1.5 size-4" />
          Yangi rol
        </Button>
      </header>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Yuklanmoqda...
        </p>
      ) : (
        <RolesList
          roles={roles}
          onSelect={(v) => navigate(`/owner/settings/rollar/${v}`)}
          onToggleFreeze={(role) =>
            setFrozen({ value: role.value, isFrozen: !role.isFrozen })
          }
          pendingValue={isPending ? variables?.value : null}
        />
      )}
    </div>
  );
};

export default RolesPage;
