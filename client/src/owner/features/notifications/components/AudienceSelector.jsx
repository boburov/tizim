import { useMemo } from "react";
import { Users, GraduationCap, UserCog, UsersRound, User } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import useObjectState from "@/shared/hooks/useObjectState";
import useDebounce from "@/shared/hooks/useDebounce";
import useAuth from "@/shared/hooks/useAuth";
import { ROLES } from "@/shared/constants/roles";
import { formatPhone } from "@/shared/utils/formatPhone";
import useGroupsListQuery from "@/owner/features/groups/hooks/useGroupsListQuery";
import useUsersListQuery from "@/owner/features/users/hooks/useUsersListQuery";

import EntityCombobox from "./EntityCombobox";
import RecipientCountPreview from "./RecipientCountPreview";

const OWNER_TYPES = [
  { value: "all_students", label: "Barcha o'quvchilar", icon: GraduationCap, hint: "Tizimdagi barcha faol o'quvchilar" },
  { value: "all_teachers", label: "Barcha o'qituvchilar", icon: UserCog, hint: "Tizimdagi barcha faol o'qituvchilar" },
  { value: "groups", label: "Guruh(lar)ga", icon: UsersRound, hint: "Tanlangan guruh a'zolari" },
  { value: "users", label: "Foydalanuvchilarga", icon: Users, hint: "Bir nechta foydalanuvchi" },
  { value: "individual", label: "Bitta foydalanuvchiga", icon: User, hint: "Faqat bitta kishi" },
];

const TEACHER_TYPES = [
  { value: "groups", label: "Guruh(lar)ga", icon: UsersRound, hint: "O'z guruhlaringiz" },
  { value: "users", label: "O'quvchilarga", icon: Users, hint: "O'z o'quvchilaringiz" },
];

const ROLE_TABS = [
  { value: ROLES.STUDENT, label: "O'quvchilar" },
  { value: ROLES.TEACHER, label: "O'qituvchilar" },
];

/**
 * AudienceSelector - segment quruvchi: tur tanlash + guruh/user combobox +
 * jonli recipient hisobi. Modulning yuragi.
 *
 * value (controlled obj): { audienceType, groupIds, userIds }
 * onChange(patch) - setFields kabi qisman yangilash.
 *
 * Tashqi state'da chip matnlari yo'qolmasligi uchun label'lar shu yerda
 * (selectedLabels) yig'iladi.
 */
const AudienceSelector = ({ value, onChange, disabled = false }) => {
  const { role } = useAuth();
  const isTeacher = role === ROLES.TEACHER;
  const types = isTeacher ? TEACHER_TYPES : OWNER_TYPES;

  // Audience obyekti `.type` kalitidan foydalanadi (backend va RecipientCountPreview
  // bilan mos). Tashqi state'da `audienceType` deb saqlansa ham shu yerga `type`
  // sifatida keladi - shuning uchun ikkalasini ham qabul qilamiz.
  const audienceType = value.type ?? value.audienceType;
  const { groupIds = [], userIds = [] } = value;

  // Ichki UI holati: qidiruv matnlari + tanlangan label keshi
  const ui = useObjectState({
    groupSearch: "",
    userSearch: "",
    userRole: ROLES.STUDENT,
    labels: {}, // { id: label }
  });

  const groupSearch = useDebounce(ui.groupSearch, 300);
  const userSearch = useDebounce(ui.userSearch, 300);

  const needGroups = audienceType === "groups";
  const needUsers = audienceType === "users" || audienceType === "individual";
  const isIndividual = audienceType === "individual";

  // Faqat kerak bo'lganda so'rov yuboriladi (enabled), aks holda bo'sh so'rov yo'q.
  const groupsQ = useGroupsListQuery(
    { search: groupSearch || undefined, archived: "0", limit: 30 },
    { enabled: needGroups },
  );
  const usersQ = useUsersListQuery(
    {
      role: ui.userRole,
      search: userSearch || undefined,
      archived: "0",
      limit: 30,
    },
    { enabled: needUsers },
  );

  const groupOptions = useMemo(
    () =>
      (needGroups ? groupsQ.data?.data || [] : []).map((g) => ({
        id: g._id,
        label: g.name,
        sublabel: g.teacher
          ? `${g.teacher.firstName || ""} ${g.teacher.lastName || ""}`.trim()
          : undefined,
      })),
    [needGroups, groupsQ.data],
  );

  const userOptions = useMemo(
    () =>
      (needUsers ? usersQ.data?.data || [] : []).map((u) => ({
        id: u._id,
        label: `${u.firstName} ${u.lastName}`,
        sublabel: u.phone ? formatPhone(u.phone) : undefined,
      })),
    [needUsers, usersQ.data],
  );

  // Tanlanganda label keshini yangilab boramiz (chip matni uchun)
  const rememberLabels = (opts) => {
    const next = { ...ui.labels };
    opts.forEach((o) => (next[o.id] = o.label));
    ui.setField("labels", next);
  };

  const handleGroups = (ids) => {
    rememberLabels(groupOptions.filter((o) => ids.includes(o.id)));
    onChange({ groupIds: ids });
  };
  const handleUsers = (ids) => {
    rememberLabels(userOptions.filter((o) => ids.includes(o.id)));
    // individual - faqat oxirgisi
    onChange({ userIds: isIndividual ? ids.slice(-1) : ids });
  };

  const setType = (t) => onChange({ audienceType: t, groupIds: [], userIds: [] });

  return (
    <div className="space-y-4">
      {/* Tur tanlash */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {types.map((t) => {
          const Icon = t.icon;
          const active = audienceType === t.value;
          return (
            <button
              key={t.value}
              type="button"
              disabled={disabled}
              onClick={() => setType(t.value)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition disabled:opacity-50",
                active
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-white hover:border-primary/40 hover:bg-muted/30",
              )}
            >
              <Icon
                className={cn(
                  "size-4",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span className="text-sm font-medium leading-tight">{t.label}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">
                {t.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* Guruh tanlash */}
      {needGroups && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Guruhlar</label>
          <EntityCombobox
            options={groupOptions}
            value={groupIds}
            onChange={handleGroups}
            search={ui.groupSearch}
            onSearchChange={(v) => ui.setField("groupSearch", v)}
            isLoading={groupsQ.isFetching}
            placeholder="Guruhlarni tanlang"
            searchPlaceholder="Guruh nomi..."
            emptyText="Guruh topilmadi"
            selectedLabels={ui.labels}
            disabled={disabled}
          />
        </div>
      )}

      {/* Foydalanuvchi tanlash */}
      {needUsers && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              {isIndividual ? "Foydalanuvchi" : "Foydalanuvchilar"}
            </label>
            {!isTeacher && (
              <div className="flex rounded-md border p-0.5">
                {ROLE_TABS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => ui.setField("userRole", r.value)}
                    className={cn(
                      "rounded px-2 py-0.5 text-xs font-medium transition",
                      ui.userRole === r.value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <EntityCombobox
            options={userOptions}
            value={userIds}
            onChange={handleUsers}
            multiple={!isIndividual}
            search={ui.userSearch}
            onSearchChange={(v) => ui.setField("userSearch", v)}
            isLoading={usersQ.isFetching}
            placeholder={isIndividual ? "Foydalanuvchini tanlang" : "Foydalanuvchilarni tanlang"}
            searchPlaceholder="Ism yoki telefon..."
            emptyText="Foydalanuvchi topilmadi"
            selectedLabels={ui.labels}
            disabled={disabled}
          />
        </div>
      )}

      {/* Jonli recipient hisobi */}
      <RecipientCountPreview audience={{ type: audienceType, groupIds, userIds }} />
    </div>
  );
};

export default AudienceSelector;
