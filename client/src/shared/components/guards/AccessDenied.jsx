// Hooks
import useAuth from "@/shared/hooks/useAuth";
import useLogout from "@/features/auth/hooks/useLogout";

// Components
import Button from "@/shared/components/ui/button/Button";

/**
 * "Bu bo'limga kira olmaysiz" ekrani.
 *
 * NEGA REDIRECT EMAS: foydalanuvchi tizimga KIRGAN, lekin roli hech bir
 * panelga to'g'ri kelmaydi (odatda custom rolning `defaultPath` i belgilanmagan).
 * Ilgari bunday holatda RoleGuard uni `/login` ga uloqtirardi, GuestGuard esa
 * darhol panelga qaytarardi - natijada cheksiz halqa. WebKit (Safari va
 * Telegram mini ilova) 10 soniyada 100 ta `history.replaceState()` dan keyin
 * `SecurityError` otadi va butun ilova ErrorBoundary'ga qulaydi; Chrome esa
 * xuddi shu halqani jimgina aylantiraveradi.
 *
 * Shuning uchun halqa shu yerda TO'XTAYDI: sabab aytiladi va chiqish yo'li
 * beriladi.
 */
const AccessDenied = () => {
  const { roleLabel, role } = useAuth();
  const { mutate: logout, isPending } = useLogout();

  return (
    <div className="flex min-h-svh items-center justify-center px-5 py-10">
      <div className="w-full max-w-md space-y-3 text-center">
        <h1 className="text-lg font-semibold">Bu bo'limga kirish yo'q</h1>
        <p className="text-sm text-muted-foreground">
          {roleLabel || role
            ? `"${roleLabel || role}" roli uchun ochiladigan bo'lim belgilanmagan.`
            : "Rolingiz aniqlanmadi."}{" "}
          Administrator "Rollar" sozlamasida shu rol uchun asosiy sahifani
          ko'rsatishi kerak.
        </p>
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => logout()}
          className="w-full"
        >
          Chiqish
        </Button>
      </div>
    </div>
  );
};

export default AccessDenied;
