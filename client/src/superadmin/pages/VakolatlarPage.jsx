import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, ShieldAlert, Users, Check, Info, Eye } from "lucide-react";

import Button from "@/shared/components/ui/button/Button";
import { Switch } from "@/shared/components/shadcn/switch";
import { cn } from "@/shared/utils/cn";
import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";
import { CAPABILITY_GROUPS } from "@/shared/workspaces";
import { WORKSPACES, WORKSPACE_META, resolveWorkspace } from "@/shared/workspaces/workspaces";
import {
  useRolesQuery, useRolesMatrixQuery, useRoleQuery,
} from "@/owner/features/roles/hooks/useRolesQuery";
import { useRoleUpdateMutation } from "@/owner/features/roles/hooks/useRoleMutations";
import PageShell from "@/shared/components/page/PageShell";
import EmptyState from "@/shared/components/page/EmptyState";

/**
 * ══════════════════════════════════════════════════════════════════════
 * VAKOLATLAR — "KIM NIMA QILA OLADI" (talab 7)
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA MAVJUD MATRITSA YETARLI EMAS ──
 * `/owner/settings/rollar` da modul × amal jadvali bor. U TO'G'RI,
 * lekin u TIZIM tilida gapiradi: qator "finance", ustun
 * "view_profitability". Ega esa "kimga o'qituvchi maoshini
 * ko'rsataman?" deb o'ylaydi va o'sha katakni topa olmaydi —
 * yomoni, topganda ham nimani ochayotganini bilmaydi.
 *
 * Bu ekran BOSHQA savolga javob beradi va shuning uchun alohida:
 * vakolatlar odam tushunchalari bo'yicha guruhlangan, har biri
 * jumla bilan tushuntirilgan, xavflilari esa OCHIQ belgilangan.
 *
 * ── ROL ISH MAKONIGA QANDAY TA'SIR QILADI ──
 * Yuqorida har rol uchun "bu odam qaysi ish makoniga tushadi"
 * ko'rsatiladi va u tanlangan vakolatlardan JONLI hisoblanadi.
 * Ya'ni ega `admin_dashboard.read` ni yoqqanda darhol ko'radi:
 * "bu rol endi FILIAL BOSHQARUVI makoniga tushadi". Ilgari bu
 * bog'liqlik umuman ko'rinmasdi.
 *
 * ── XAVFSIZLIK ──
 * Bu ekran faqat `roles.update` bilan yozadi va server har
 * so'rovni qayta tekshiradi. Ruxsati yo'q foydalanuvchida
 * kalitlar QULFLANGAN holda ko'rinadi — yashirilmaydi: "nima
 * yo'qligini ko'rish" ham axborot va u chalg'itmaydi.
 */

const WORKSPACE_BADGE = {
  [WORKSPACES.SUPER_ADMIN]: "bg-primary/10 text-primary",
  [WORKSPACES.ADMIN]: "bg-info/10 text-info",
  [WORKSPACES.STAFF]: "bg-muted text-muted-foreground",
  [WORKSPACES.STUDENT]: "bg-muted text-muted-foreground",
};

const VakolatlarPage = () => {
  const { has } = usePermissions();
  const canRead = has(PERMISSIONS.ROLES_READ);
  const canWrite = has(PERMISSIONS.ROLES_UPDATE);

  const [selected, setSelected] = useState(null);
  // Tahrir holati — SAQLANMAGUNCHA serverga tegmaydi.
  const [draft, setDraft] = useState(null);

  const roles = useRolesQuery();
  const matrix = useRolesMatrixQuery();
  const role = useRoleQuery(selected);
  // `useRoleUpdateMutation` o'zi "Saqlandi" toastini ko'rsatadi —
  // bu yerda ikkinchisini qo'shish takror bo'lardi.
  const update = useRoleUpdateMutation({ onSuccess: () => setDraft(null) });

  // `key` → `id`: server `permissionIds` bilan ishlaydi, ekran esa
  // kalitlar bilan. Xarita matritsadan quriladi — kalitlar ro'yxati
  // SERVERNIKI, katalog faqat ularni nomlaydi.
  const keyToId = useMemo(() => {
    const map = new Map();
    for (const m of matrix.data?.modules || []) {
      for (const cell of Object.values(m.cells || {})) map.set(cell.key, cell.id);
    }
    return map;
  }, [matrix.data]);

  // `useMemo` — referens barqarorligi uchun: pastdagi `previewWorkspace`
  // shu massivga bog'langan va har render'da yangi massiv bo'lsa,
  // ish makoni har safar qayta hisoblanardi.
  const activeKeys = useMemo(
    () => draft ?? role.data?.permissionKeys ?? [],
    [draft, role.data],
  );
  const dirty = draft !== null;

  const toggle = (key) => {
    if (!canWrite) return;
    const set = new Set(activeKeys);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    setDraft([...set]);
  };

  const save = () => {
    const ids = activeKeys.map((k) => keyToId.get(k)).filter(Boolean);
    update.mutate({ value: selected, body: { permissionIds: ids } });
  };

  // Rol qaysi makonga tushadi — TANLANGAN vakolatlardan hisoblanadi.
  const previewWorkspace = useMemo(() => {
    if (!role.data) return null;
    const set = new Set(activeKeys);
    return resolveWorkspace(
      { roleType: role.data.roleType },
      (k) => set.has(k),
    );
  }, [role.data, activeKeys]);

  if (!canRead) {
    return (
      <PageShell title="Vakolatlar">
        <EmptyState
          icon={ShieldCheck}
          title="Bu bo'lim yopiq"
          hint="Rollarni ko'rish uchun tegishli ruxsat kerak."
        />
      </PageShell>
    );
  }

  const roleList = roles.data || [];

  return (
    <PageShell
      title="Vakolatlar"
      subtitle="Har rol nima qila olishi — odam tilida. O'zgarish darhol barcha shu roldagi odamlarga tegadi."
    >
      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        {/* ── ROLLAR ── */}
        <aside className="space-y-1.5">
          {roleList.map((r) => {
            const ws = resolveWorkspace(
              { roleType: r.roleType },
              (k) => (r.permissionKeys || []).includes(k),
            );
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => {
                  setSelected(r.value);
                  setDraft(null);
                }}
                className={cn(
                  "w-full rounded-xl border px-3 py-2.5 text-left transition",
                  selected === r.value
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:bg-muted/60",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {r.label}
                  </span>
                  {r.isFrozen && (
                    <span className="shrink-0 text-[10px] text-destructive">muzlatilgan</span>
                  )}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium",
                      WORKSPACE_BADGE[ws],
                    )}
                  >
                    {WORKSPACE_META[ws]?.label}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Users className="size-2.5" />
                    {r.userCount ?? 0}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    · {(r.permissionKeys || []).length} vakolat
                  </span>
                </span>
              </button>
            );
          })}
        </aside>

        {/* ── VAKOLATLAR ── */}
        <div className="min-w-0 space-y-4">
          {!selected ? (
            <EmptyState
              icon={ShieldCheck}
              title="Rolni tanlang"
              hint="Chapdagi ro'yxatdan rolni tanlang — u nima qila olishini ko'rasiz va o'zgartira olasiz."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {role.data?.label || selected}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Info className="size-3 shrink-0" />
                    Bu rol
                    <strong className="text-foreground">
                      {WORKSPACE_META[previewWorkspace]?.label}
                    </strong>
                    makoniga tushadi — {WORKSPACE_META[previewWorkspace]?.tagline}
                  </p>
                  {/* ══════════════════════════════════════════════════
                      «BU ODAM NIMA KO'RADI?» — KO'RIB TEKSHIRISH
                      ══════════════════════════════════════════════════

                      Ega vakolat berayotganda aslida bitta savolga
                      javob izlaydi: "bu odam nima ko'radi?". Ro'yxatdagi
                      belgilar buni AYTADI, lekin KO'RSATMAYDI.

                      Ilgari buni tekshirishning yagona yo'li — o'sha
                      roldagi odam bo'lib tizimga kirish edi. Ya'ni
                      amalda hech kim tekshirmasdi.

                      Havola makonning bosh sahifasini ochadi. Ega
                      barcha makonga kira oladi (`WorkspaceGuard`),
                      shuning uchun bu yangi huquq bermaydi — faqat
                      mavjud imkoniyatni KO'RINADIGAN qiladi. */}
                  {previewWorkspace !== WORKSPACES.STUDENT && (
                    <Link
                      to={WORKSPACE_META[previewWorkspace]?.home || "/org"}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Eye className="size-3" />
                      Bu makonni ko'rib chiqish
                    </Link>
                  )}
                </div>
                {canWrite && (
                  <Button
                    size="sm"
                    disabled={!dirty || update.isPending}
                    onClick={save}
                  >
                    <Check className="size-4" />
                    {update.isPending ? "Saqlanmoqda…" : "Saqlash"}
                  </Button>
                )}
              </div>

              {role.data?.isSystem && (
                <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Bu tizim roli. Ega roli har doim to'liq huquqqa ega bo'ladi —
                  undan vakolat olib tashlash tizimni boshqarib bo'lmaydigan
                  holatga olib kelardi.
                </p>
              )}

              {CAPABILITY_GROUPS.map((group) => (
                <section key={group.key} className="rounded-xl border border-border bg-card">
                  <header className="border-b border-border px-4 py-2.5">
                    <h2 className="text-sm font-medium text-foreground">{group.label}</h2>
                    <p className="text-xs text-muted-foreground">{group.summary}</p>
                  </header>
                  <ul className="divide-y divide-border">
                    {group.items.map((item) => {
                      const on = activeKeys.includes(item.key);
                      return (
                        <li
                          key={item.key}
                          className="flex items-start justify-between gap-3 px-4 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-1.5 text-sm text-foreground">
                              {item.label}
                              {item.sensitive && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                                  <ShieldAlert className="size-2.5" />
                                  sezgir
                                </span>
                              )}
                            </p>
                            {item.hint && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{item.hint}</p>
                            )}
                          </div>
                          <Switch
                            checked={on}
                            disabled={!canWrite || role.data?.isSystem}
                            onCheckedChange={() => toggle(item.key)}
                            aria-label={item.label}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
};

export default VakolatlarPage;
