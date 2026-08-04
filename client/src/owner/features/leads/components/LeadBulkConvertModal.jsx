// React
import { useMemo } from "react";

// Icons
import { RefreshCw, Copy, CheckCircle2, AlertTriangle } from "lucide-react";

// Sonner
import { toast } from "sonner";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import useGroupsListQuery from "@/owner/features/groups/hooks/useGroupsListQuery";
import { useLeadConvertBulkMutation } from "../hooks/useLeadMutations";

// Components
import Button from "@/shared/components/ui/button/Button";
import Input from "@/shared/components/ui/input/Input";
import CreatableSelectField from "@/shared/components/ui/select/CreatableSelectField";
import GroupCreateModal from "@/owner/features/groups/components/modals/GroupCreateModal";

// Constants
import { PERMISSIONS } from "@/shared/constants/permissions";

// Utils
import { formatPhone } from "@/shared/utils/formatPhone";
import { generatePassword, generateUsername } from "@/shared/utils/credentials";

// Har lid uchun login/parol. Loginlar RO'YXAT ICHIDA ham takrorlanmasligi
// kerak: bir xil ismli ikki lid bo'lsa serverdan 409 kutmasdan `...2` qilinadi.
const buildRows = (leads = []) => {
  const taken = [];
  return leads.map((l) => {
    const username = generateUsername(l.firstName, l.lastName, taken);
    taken.push(username);
    return {
      id: l._id,
      firstName: l.firstName || "",
      lastName: l.lastName || "",
      phone: l.phone || "",
      username,
      password: generatePassword(),
    };
  });
};

const cell = "px-2 py-1.5 align-middle";

const LeadBulkConvertModal = ({
  leads = [],
  close,
  isLoading,
  setIsLoading,
  onDone,
}) => {
  const {
    rows,
    groupId,
    result,
    setField,
    setFields,
  } = useObjectState({
    rows: buildRows(leads),
    groupId: "",
    // Yakun paneli: aylantirilganlar (login/parol bilan) va yiqilganlar.
    result: null,
  });

  const { data: groupsData, isLoading: loadingGroups } = useGroupsListQuery({
    limit: 200,
  });
  const groupOptions = useMemo(
    () => [
      { value: "", label: "Guruhsiz" },
      ...(groupsData?.data || []).map((g) => ({ value: g._id, label: g.name })),
    ],
    [groupsData],
  );

  const { mutate } = useLeadConvertBulkMutation({
    onSuccess: (data) => {
      setIsLoading(false);
      setField("result", data);
      // Tanlov DARHOL tozalanadi (modal yopilishini kutmasdan): aks holda
      // oyna X orqali yopilsa allaqachon aylantirilgan lidlar tanlangan
      // holicha qolib, ikkinchi urinishda "allaqachon aylantirilgan" xatosi
      // chiqardi.
      onDone?.();
    },
    onError: () => setIsLoading(false),
  });

  const patchRow = (id, key, value) =>
    setField(
      "rows",
      rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)),
    );

  const regenerateAll = () =>
    setField(
      "rows",
      buildRows(
        rows.map((r) => ({
          _id: r.id,
          firstName: r.firstName,
          lastName: r.lastName,
          phone: r.phone,
        })),
      ),
    );

  const copyText = async (text, label) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} nusxa olindi`);
    } catch {
      toast.error("Nusxa olishda xatolik");
    }
  };

  // Loginlar takrorlanmasin - server ham tekshiradi, lekin xatoni bosishdan
  // OLDIN ko'rsatgan yaxshi (yarim aylantirilgan ro'yxat qolib ketmasin).
  const duplicateUsernames = useMemo(() => {
    const seen = new Set();
    const dup = new Set();
    for (const r of rows) {
      const u = r.username.trim().toLowerCase();
      if (!u) continue;
      if (seen.has(u)) dup.add(u);
      seen.add(u);
    }
    return dup;
  }, [rows]);

  const invalidRow = rows.find(
    (r) =>
      !r.firstName.trim() ||
      !r.lastName.trim() ||
      r.username.trim().length < 3 ||
      r.password.length < 6 ||
      !r.phone,
  );
  const canSubmit = rows.length && !invalidRow && !duplicateUsernames.size;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    mutate({
      groupId: groupId || null,
      leads: rows.map((r) => ({
        id: r.id,
        firstName: r.firstName.trim(),
        lastName: r.lastName.trim(),
        username: r.username.trim(),
        phone: r.phone,
        password: r.password,
      })),
    });
  };

  // ── Yakun paneli ──
  if (result) {
    const { converted = [], failed = [] } = result;
    const asText = converted
      .map((c) => `${c.firstName} ${c.lastName}: ${c.username} / ${c.password}`)
      .join("\n");

    return (
      <div className="space-y-4">
        {converted.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4" />
                {converted.length} ta o'quvchi yaratildi
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copyText(asText, "Ro'yxat")}
              >
                <Copy className="size-3.5" />
                Hammasini nusxalash
              </Button>
            </div>

            {/* Parollar FAQAT shu yerda ochiq ko'rinadi - operator ularni
                o'quvchilarga berishi kerak, keyin qayta tiklab bo'lmaydi. */}
            <ul className="max-h-64 space-y-1.5 overflow-y-auto rounded-md border p-2">
              {converted.map((c) => (
                <li
                  key={c.leadId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-sm px-1.5 py-1 text-sm"
                >
                  <span className="font-medium">
                    {c.firstName} {c.lastName}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {c.username} / {c.password}
                  </span>
                  {c.groupError && (
                    <span className="w-full text-[11px] text-amber-700 dark:text-amber-300">
                      Guruhga qo'shilmadi: {c.groupError}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {failed.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-300">
              <AlertTriangle className="size-4" />
              {failed.length} ta lid aylantirilmadi
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-red-200 dark:border-red-500/30 p-2 text-sm">
              {failed.map((f) => (
                <li key={f.leadId}>
                  <span className="font-medium">{f.name || "Lid"}</span>
                  <span className="text-muted-foreground"> — {f.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button type="button" onClick={() => close?.()} className="w-full">
          Yopish
        </Button>
      </div>
    );
  }

  // ── Asosiy forma ──
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <CreatableSelectField
        searchable
        label="Guruh"
        description="Tanlangan lidlar aylantirilib, shu guruhga qabul qilinadi. Guruh yo'q bo'lsa — o'ng tomondagi «Yangi guruh»."
        value={groupId}
        onChange={(v) => setField("groupId", v)}
        options={groupOptions}
        isLoading={loadingGroups}
        placeholder="Guruhni tanlang"
        searchPlaceholder="Guruh qidirish..."
        emptyText="Guruh topilmadi"
        disabled={isLoading}
        createLabel="Yangi guruh"
        createTitle="Yangi guruh"
        createPermission={PERMISSIONS.GROUPS_CREATE}
        createClassName="max-w-2xl"
        create={<GroupCreateModal />}
        onCreated={(g) => setField("groupId", g._id)}
      />

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {rows.length} ta lid — login va parol tayyor, kerak bo'lsa tahrirlang.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={regenerateAll}
          disabled={isLoading}
        >
          <RefreshCw className="size-3.5" />
          Qayta generatsiya
        </Button>
      </div>

      <div className="max-h-[45vh] overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr className="text-left text-xs text-muted-foreground">
              <th className={cell}>O'quvchi</th>
              <th className={cell}>Login</th>
              <th className={cell}>Parol</th>
              <th className={cell} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dup = duplicateUsernames.has(r.username.trim().toLowerCase());
              return (
                <tr key={r.id} className="border-t">
                  <td className={cell}>
                    <p className="font-medium">
                      {r.firstName} {r.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPhone(r.phone)}
                    </p>
                  </td>
                  <td className={cell}>
                    <Input
                      value={r.username}
                      // Input standart 20 belgi bilan cheklaydi, server 40.
                      maxLength={40}
                      onChange={(e) => patchRow(r.id, "username", e.target.value)}
                      disabled={isLoading}
                      className={
                        dup ? "h-8 border-red-500 outline-red-500" : "h-8"
                      }
                    />
                    {dup && (
                      <p className="mt-0.5 text-[11px] text-red-600 dark:text-red-300">
                        Login takrorlangan
                      </p>
                    )}
                  </td>
                  <td className={cell}>
                    <Input
                      value={r.password}
                      onChange={(e) => patchRow(r.id, "password", e.target.value)}
                      disabled={isLoading}
                      className="h-8 font-mono"
                    />
                  </td>
                  <td className={cell}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      title="Shu qator uchun qayta generatsiya"
                      aria-label="Shu qator uchun qayta generatsiya"
                      disabled={isLoading}
                      onClick={() =>
                        setFields({
                          rows: rows.map((x) =>
                            x.id === r.id
                              ? {
                                  ...x,
                                  username: generateUsername(
                                    x.firstName,
                                    x.lastName,
                                    rows
                                      .filter((y) => y.id !== x.id)
                                      .map((y) => y.username),
                                  ),
                                  password: generatePassword(),
                                }
                              : x,
                          ),
                        })
                      }
                    >
                      <RefreshCw className="size-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {invalidRow && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Har bir qatorda ism, familiya, telefon, login (3+) va parol (6+)
          to'ldirilgan bo'lishi kerak.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => close?.()}
          disabled={isLoading}
          className="flex-1"
        >
          Bekor qilish
        </Button>
        <Button
          type="submit"
          disabled={isLoading || !canSubmit}
          className="flex-1"
        >
          {isLoading
            ? "Aylantirilmoqda..."
            : `${rows.length} ta lidni qabul qilish`}
        </Button>
      </div>
    </form>
  );
};

export default LeadBulkConvertModal;
