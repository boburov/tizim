// React
import { useMemo } from "react";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import useActiveBranch from "@/shared/hooks/useActiveBranch";
import useUsersListQuery from "@/owner/features/users/hooks/useUsersListQuery";

// Sonner
import { toast } from "sonner";

// Components
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import CreatableSelectField from "@/shared/components/ui/select/CreatableSelectField";
import Button from "@/shared/components/ui/button/Button";
import GroupScheduleField from "./GroupScheduleField";
import UserCreateModal from "@/owner/features/users/components/UserCreateModal";

// Constants
import { ROLES } from "@/shared/constants/roles";
import { PERMISSIONS } from "@/shared/constants/permissions";

// Utils
import { toDateInput } from "@/shared/utils/formatDate";
import { scheduleActiveOn } from "@/shared/utils/formatSchedule";

const buildInitial = (group) => ({
  // Faqat yaratishda va faqat "Barcha filiallar" rejimida so'raladi.
  branchId: "",
  name: group?.name || "",
  // Versiyalash: tahrirlashda faqat HOZIRGI amaldagi versiya qatorlarini
  // ko'rsatamiz (effectiveFrom'siz, toza). Tarixiy versiyalar serverda saqlanadi.
  schedule: scheduleActiveOn(group?.schedule || []).map((s) => ({
    day: s.day,
    startTime: s.startTime,
    endTime: s.endTime,
  })),
  // Yangi jadval qaysi sanadan amal qiladi (tahrirlash rejimida) - default bugun
  scheduleEffectiveFrom: toDateInput(new Date()),
  // Guruhda ko'pi bilan bitta o'qituvchi - birinchisini olamiz (id string)
  teacher: (() => {
    const first = (group?.teachers || [])[0];
    if (!first) return "";
    return typeof first === "string" ? first : first._id;
  })(),
  // Yangi guruh - default bugun; mavjud guruh - o'z sanasi (yoki bo'sh)
  startDate: group?.startDate
    ? toDateInput(group.startDate)
    : group
      ? ""
      : toDateInput(new Date()),
  // Kurs tugash sanasi - default bo'sh (= aktiv). Belgilansa kurs avto tugaydi.
  endDate: group?.endDate ? toDateInput(group.endDate) : "",
  // Oylik narx - faqat yangi guruh yaratishda (joriy oy GroupFee summasi).
  monthlyPrice: "",
  // Oy o'rtasida kirish siyosati. Standart "prorated" - serverdagi bilan bir xil.
  entryBilling: group?.entryBilling || "prorated",
});

const ENTRY_BILLING_OPTIONS = [
  { value: "prorated", label: "Faqat qolgan qismi" },
  { value: "full", label: "To'liq oylik" },
];

const GroupForm = ({
  initial,
  onSubmit,
  onCancel,
  isLoading = false,
  submitLabel = "Saqlash",
}) => {
  // Tahrirlash rejimida o'qituvchi tanlash KO'RSATILMAYDI - o'qituvchini faqat
  // "Almashtirish" tugmasi orqali o'zgartirish mumkin (stavka ham to'g'ri ko'chadi).
  const isEdit = Boolean(initial);

  const {
    branchId,
    name,
    schedule,
    teacher,
    startDate,
    endDate,
    monthlyPrice,
    entryBilling,
    scheduleEffectiveFrom,
    setField,
  } = useObjectState(buildInitial(initial));

  // FILIAL. Odatda server aktiv filialdan (x-branch-id) oladi. Lekin
  // "Barcha filiallar" rejimida aktiv filial YO'Q - guruh qaysi filialda
  // ochilayotganini SO'RAYMIZ. Guruh filial ko'lamining ildizi bo'lgani
  // uchun bu tanlov keyin davomat/to'lov/maoshga ham tarqaladi.
  const { branches, isAllBranches, multiBranch } = useActiveBranch();
  const needsBranch = !isEdit && multiBranch && isAllBranches;
  const branchOptions = useMemo(
    () => branches.map((b) => ({ value: String(b._id), label: b.name })),
    [branches],
  );

  // O'qituvchi tanlash uchun ro'yxat - faqat yangi guruh yaratishda kerak.
  const { data: teachersData } = useUsersListQuery({
    role: ROLES.TEACHER,
    limit: 100,
  });
  const teacherOptions = useMemo(
    () =>
      (teachersData?.data || []).map((t) => ({
        value: t._id,
        label: `${t.firstName} ${t.lastName || ""}`.trim(),
      })),
    [teachersData],
  );

  // Tahrirlashda jadval HOZIRGI versiyadan o'zgartirilganmi - shunda "amal qilish
  // sanasi" maydonini ko'rsatamiz (yangi versiya shu sanadan boshlab amal qiladi).
  const initialScheduleKey = JSON.stringify(
    (buildInitial(initial).schedule || []).map((s) => [
      s.day,
      s.startTime,
      s.endTime,
    ]),
  );
  const currentScheduleKey = JSON.stringify(
    schedule.map((s) => [s.day, s.startTime, s.endTime]),
  );
  const scheduleChanged = isEdit && initialScheduleKey !== currentScheduleKey;

  // Jadvalda takrorlangan kun bormi
  const hasDuplicateDays = (() => {
    const seen = new Set();
    for (const s of schedule) {
      if (seen.has(s.day)) return true;
      seen.add(s.day);
    }
    return false;
  })();

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      toast.error("Guruh nomini kiriting");
      return;
    }
    if (trimmedName.length < 2) {
      toast.error("Guruh nomi kamida 2 belgidan iborat bo'lishi kerak");
      return;
    }
    if (trimmedName.length > 120) {
      toast.error("Guruh nomi 120 belgidan oshmasligi kerak");
      return;
    }
    for (const s of schedule) {
      if (!s.day) {
        toast.error("Jadval kunini tanlang");
        return;
      }
      if (!s.startTime || !s.endTime) {
        toast.error("Jadvaldagi vaqtlarni to'liq kiriting");
        return;
      }
      if (s.startTime >= s.endTime) {
        toast.error("Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak");
        return;
      }
    }
    if (hasDuplicateDays) {
      toast.error("Jadvalda bir kun bir necha marta takrorlangan");
      return;
    }
    // Yangi guruh - kurs tugash sanasidan boshqa hamma maydon majburiy.
    if (!isEdit) {
      if (needsBranch && !branchId) {
        toast.error("Filialni tanlang");
        return;
      }
      if (schedule.length === 0) {
        toast.error("Kamida bitta dars kuni qo'shing");
        return;
      }
      if (!startDate) {
        toast.error("Dars boshlanish sanasini kiriting");
        return;
      }
      if (!teacher) {
        toast.error("O'qituvchi tanlang");
        return;
      }
      if (monthlyPrice === "" || monthlyPrice == null) {
        toast.error("Oylik to'lovni kiriting");
        return;
      }
    }
    if (startDate && endDate && endDate < startDate) {
      toast.error("Kurs tugash sanasi boshlanish sanasidan oldin bo'lmasin");
      return;
    }

    const payload = {
      name: trimmedName,
      schedule,
      startDate: startDate || null,
      endDate: endDate || null,
      entryBilling,
    };
    // Jadval o'zgartirilgan bo'lsa - yangi versiya qaysi sanadan amal qilishini
    // yuboramiz (server eski versiyani tarix uchun saqlaydi).
    if (scheduleChanged) {
      payload.scheduleEffectiveFrom = scheduleEffectiveFrom || null;
    }
    // O'qituvchini faqat yaratishda yuboramiz. Tahrirlashda o'qituvchi
    // "Almashtirish" orqali boshqariladi - bu yerda tegmaymiz.
    if (!isEdit) {
      payload.teachers = [teacher];
      // Oylik narx majburiy - joriy oy GroupFee summasi bo'ladi.
      payload.monthlyPrice = Number(monthlyPrice);
      // "Barcha filiallar" rejimida tanlangan filial. Boshqa holatda
      // yubormaymiz - server aktiv filialdan aniqlaydi.
      if (needsBranch && branchId) payload.branchId = branchId;
    }

    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* "Barcha filiallar" rejimi: guruh qaysi filialda ochilishi */}
      {needsBranch && (
        <SelectField
          name="branchId"
          label="Filial"
          placeholder="Filialni tanlang"
          value={branchId}
          onChange={(v) => setField("branchId", v?.target?.value ?? v)}
          options={branchOptions}
          required
          error={!branchId}
          disabled={isLoading}
        />
      )}

      {/* 1-qator: nom */}
      <InputField
        name="name"
        label="Guruh nomi"
        placeholder="Masalan: Arabcha A1"
        value={name}
        onChange={(e) => setField("name", e.target.value)}
        required
        disabled={isLoading}
      />

      {/* 2-qator: dars boshlanish + kurs tugash sanasi */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InputField
          type="date"
          name="startDate"
          label="Dars boshlanish sanasi"
          value={startDate}
          onChange={(e) => setField("startDate", e.target.value)}
          required={!isEdit}
          disabled={isLoading}
        />
        <InputField
          type="date"
          name="endDate"
          label="Kurs tugash sanasi"
          min={startDate || undefined}
          value={endDate}
          onChange={(e) => setField("endDate", e.target.value)}
          disabled={isLoading}
        />
      </div>

      {/* OY O'RTASIDA KIRISH SIYOSATI.
          Guruh 1-sanadan boshlanmaganda ham, o'quvchi keyinroq qo'shilganda
          ham SHU tanlov ishlaydi - kirish nuqtasi uchun yagona qoida. */}
      <div>
        <SelectField
          name="entryBilling"
          label="Oy o'rtasida kirganda"
          value={entryBilling}
          onChange={(v) => setField("entryBilling", v?.target?.value ?? v)}
          options={ENTRY_BILLING_OPTIONS}
          disabled={isLoading}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {entryBilling === "full"
            ? "Qachon kirsa ham butun oylik olinadi."
            : "Kirgan kundan qolgan darslar ulushicha olinadi."}{" "}
          Chiqish va muzlatish baribir ulushiga qarab hisoblanadi.
        </p>
      </div>

      {/* O'qituvchi + oylik narx - faqat yangi guruh yaratishda */}
      {!isEdit && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CreatableSelectField
            searchable
            name="teacher"
            label="O'qituvchi"
            required
            value={teacher}
            onChange={(v) => setField("teacher", v)}
            options={teacherOptions}
            placeholder="O'qituvchi tanlang"
            searchPlaceholder="O'qituvchi qidirish..."
            emptyText="O'qituvchi topilmadi"
            disabled={isLoading}
            createLabel="Yangi o'qituvchi"
            createTitle="Yangi o'qituvchi"
            createPermission={PERMISSIONS.USERS_CREATE}
            create={<UserCreateModal defaultRole={ROLES.TEACHER} />}
            onCreated={(t) => setField("teacher", t._id)}
          />
          <InputField
            type="money"
            name="monthlyPrice"
            label="Oylik to'lov (so'm)"
            placeholder="Masalan: 500 000"
            value={monthlyPrice}
            onChange={(e) => setField("monthlyPrice", e.target.value)}
            required
            disabled={isLoading}
          />
        </div>
      )}

      {/* 3-qator: dars jadvali (to'liq enga) */}
      <div className="space-y-3">
        <GroupScheduleField
          value={schedule}
          onChange={(next) => setField("schedule", next)}
          disabled={isLoading}
        />
        {scheduleChanged && (
          <div className="rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-2">
            <InputField
              type="date"
              name="scheduleEffectiveFrom"
              label="Yangi jadval qaysi sanadan amal qiladi?"
              value={scheduleEffectiveFrom}
              onChange={(e) => setField("scheduleEffectiveFrom", e.target.value)}
              disabled={isLoading}
            />
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Eski jadval shu sanagacha bo'lgan davomat hisobida saqlanib qoladi
              - tarixiy dars soni o'zgarmaydi.
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2 justify-end">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            className="min-w-28"
          >
            Bekor qilish
          </Button>
        )}
        <Button
          type="submit"
          disabled={isLoading || hasDuplicateDays}
          className="min-w-28"
          title={
            hasDuplicateDays
              ? "Jadvalda takrorlangan kun bor"
              : undefined
          }
        >
          {isLoading ? "Saqlanmoqda..." : submitLabel}
        </Button>
      </div>
    </form>
  );
};

export default GroupForm;
