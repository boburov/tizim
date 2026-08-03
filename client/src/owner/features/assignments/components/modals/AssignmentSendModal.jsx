// React
import { useEffect, useRef } from "react";

// Icons
import { Paperclip, X, Send, HardDrive, Users } from "lucide-react";

// Components
import Field from "@/shared/components/ui/field/Field";
import Input from "@/shared/components/ui/input/Input";
import Button from "@/shared/components/ui/button/Button";
import { EntityCombobox } from "@/owner/features/notifications";
import BlockedWarning from "../BlockedWarning";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import useObjectState from "@/shared/hooks/useObjectState";
import useStorageUsageQuery, { formatBytes } from "@/shared/hooks/useStorageUsage";
import { useSendAssignmentMutation } from "../../hooks/useAssignmentMutations";
import { useAssignmentPreviewQuery } from "../../hooks/useAssignmentsQuery";
import { useMyGroupsQuery } from "@/teacher/features/groups";
import { useGroupsListQuery } from "@/owner/features/groups";

// Constants
import { ROLES } from "@/shared/constants/roles";

const INITIAL = {
  title: "",
  body: "",
  dueDate: "",
  groupIds: [],
  file: null,
  progress: 0,
  fileError: "",
};

/**
 * VAZIFA YUBORISH FORMASI.
 *
 * Ikki xil chegara ikki xil joyda tekshiriladi:
 *   - BITTA FAYL o'lchami va MARKAZ KVOTASI - fayl tanlangan zahoti,
 *     ya'ni yuklashdan OLDIN (server baribir qayta tekshiradi, lekin
 *     5 MB ni yuklab, keyin rad javobini olish foydalanuvchi vaqti);
 *   - BOT holati - guruh tanlangan zahoti (BlockedWarning).
 */
const AssignmentSendModal = ({ setIsLoading, close }) => {
  const { role, roleType } = useAuth();
  const fileInputRef = useRef(null);
  const {
    title,
    body,
    dueDate,
    groupIds,
    file,
    progress,
    fileError,
    setField,
    setFields,
  } = useObjectState(INITIAL);

  const isTeacher = role === ROLES.TEACHER || roleType === ROLES.TEACHER;

  // Guruh manbasi rolga qarab: o'qituvchi faqat O'ZI dars beradigan
  // guruhlarni ko'radi (server ham shuni majburlaydi, bu esa ro'yxatni
  // bekorga to'ldirmaslik uchun).
  const myGroups = useMyGroupsQuery({ enabled: isTeacher });
  const allGroups = useGroupsListQuery(
    { limit: 200, isActive: true },
    { enabled: !isTeacher },
  );

  const groupOptions = (
    isTeacher ? myGroups.data || [] : allGroups.data?.data || []
  ).map((g) => ({ id: String(g._id), label: g.name }));

  const { data: usage } = useStorageUsageQuery();
  const { data: preview, isFetching: previewLoading } =
    useAssignmentPreviewQuery(groupIds);

  const { mutate: send, isPending } = useSendAssignmentMutation({
    onProgress: (p) => setField("progress", p),
    onSuccess: () => close?.(),
  });

  // ModalWrapper oynani yopilishdan saqlaydi (isLoading) - yuklash
  // yarmida yopilsa so'rov uzilib, fayl yarim ketardi.
  useEffect(() => {
    setIsLoading?.(isPending);
  }, [isPending, setIsLoading]);

  // Fayl tanlangan zahoti chegaralarga solishtiramiz.
  const onFileChange = (e) => {
    const picked = e.target.files?.[0] || null;
    if (!picked) return setFields({ file: null, fileError: "" });

    if (usage && picked.size > usage.maxUploadBytes) {
      return setFields({
        file: null,
        fileError: `Fayl juda katta (${formatBytes(picked.size)}). Chegara: ${formatBytes(
          usage.maxUploadBytes,
        )}`,
      });
    }
    if (usage && picked.size > usage.freeBytes) {
      return setFields({
        file: null,
        fileError: `Joy yetmaydi: bo'sh joy ${formatBytes(
          usage.freeBytes,
        )}, fayl ${formatBytes(picked.size)}. Eski vazifalarni o'chiring.`,
      });
    }
    setFields({ file: picked, fileError: "" });
  };

  const clearFile = () => {
    setFields({ file: null, fileError: "" });
    // input.value tozalanmasa bir xil faylni qayta tanlaganda onChange
    // umuman ishlamaydi (brauzer "o'zgarish yo'q" deb hisoblaydi).
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const storageFull = Boolean(usage?.isFull);
  const canSubmit =
    title.trim().length > 0 && groupIds.length > 0 && !isPending;

  const onSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    send({ title: title.trim(), body: body.trim(), groupIds, dueDate, file });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Guruh(lar)">
        <EntityCombobox
          multiple
          options={groupOptions}
          value={groupIds}
          onChange={(v) => setField("groupIds", v)}
          isLoading={myGroups.isLoading || allGroups.isLoading}
          placeholder="Guruhni tanlang"
          searchPlaceholder="Guruh nomi..."
          emptyText="Guruh topilmadi"
          disabled={isPending}
        />
      </Field>

      {/* Nechta o'quvchiga yetadi + kim ololmaydi */}
      {groupIds.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2.5 text-sm">
            <Users className="size-4 shrink-0 text-muted-foreground" />
            {previewLoading || !preview ? (
              <span className="text-muted-foreground">Hisoblanmoqda...</span>
            ) : (
              <span>
                <b>{preview.deliverable}</b> ta o'quvchiga yetkaziladi
                <span className="text-muted-foreground">
                  {" "}
                  (jami {preview.total} ta)
                </span>
              </span>
            )}
          </div>
          <BlockedWarning preview={preview} />
        </div>
      )}

      <Field label="Sarlavha">
        <Input
          value={title}
          maxLength={200}
          disabled={isPending}
          placeholder="Masalan: Uy vazifasi - 12-dars"
          onChange={(e) => setField("title", e.target.value)}
        />
      </Field>

      <Field label="Vazifa matni">
        <Input
          type="textarea"
          value={body}
          maxLength={4000}
          disabled={isPending}
          placeholder="Vazifa shartini yozing..."
          onChange={(e) => setField("body", e.target.value)}
        />
      </Field>

      <Field label="Topshirish muddati (ixtiyoriy)">
        <Input
          type="date"
          value={dueDate}
          disabled={isPending}
          onChange={(e) => setField("dueDate", e.target.value)}
        />
      </Field>

      {/* --- Biriktirma --- */}
      <Field label="Fayl (ixtiyoriy)">
        <div className="space-y-2">
          {/* Kvota to'lgan bo'lsa fayl tanlash IMKONI umuman berilmaydi:
              tanlatib, keyin rad etish foydalanuvchini bekorga kutdirardi. */}
          {storageFull ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              Markazning fayl xotirasi to'lgan ({formatBytes(usage.usedBytes)} /{" "}
              {formatBytes(usage.quotaBytes)}). Vazifani faqat matn sifatida
              yuborish mumkin. Joy bo'shatish uchun eski vazifalarni o'chiring.
            </p>
          ) : (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={onFileChange}
                disabled={isPending}
                className="block w-full cursor-pointer rounded-md border border-input bg-card p-2 text-sm file:mr-3 file:cursor-pointer file:rounded-[2px] file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium"
              />
              {file && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-2.5 py-2 text-sm">
                  <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatBytes(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={clearFile}
                    disabled={isPending}
                    aria-label="Faylni olib tashlash"
                    className="rounded-sm p-0.5 hover:bg-muted"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
            </>
          )}

          {fileError && (
            <p className="text-xs font-medium text-destructive">{fileError}</p>
          )}

          {usage && !storageFull && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HardDrive className="size-3.5 shrink-0" />
              Bitta fayl {formatBytes(usage.maxUploadBytes)} gacha - bo'sh joy{" "}
              {formatBytes(usage.freeBytes)}
            </p>
          )}
        </div>
      </Field>

      {/* Yuklash chizig'i - katta faylda "osilib qoldi" hissi bo'lmasin */}
      {isPending && file && (
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => close?.()}
        >
          Bekor qilish
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          <Send className="size-4" />
          {isPending ? "Yuborilmoqda..." : "Yuborish"}
        </Button>
      </div>
    </form>
  );
};

export default AssignmentSendModal;
