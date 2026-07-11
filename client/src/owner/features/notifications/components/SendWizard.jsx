import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Send,
  CalendarClock,
  Check,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatDateTimeUz } from "@/shared/utils/formatDate";
import Button from "@/shared/components/ui/button/Button";
import useObjectState from "@/shared/hooks/useObjectState";
import useAuth from "@/shared/hooks/useAuth";
import { ROLES } from "@/shared/constants/roles";
import {
  AUDIENCE_TYPE_LABEL,
  CHANNEL_LABEL,
} from "@/shared/constants/notification";

import ChannelSelector from "./ChannelSelector";
import AudienceSelector from "./AudienceSelector";
import { isAudienceReady } from "./RecipientCountPreview";
import RecipientCountPreview from "./RecipientCountPreview";
import MessageComposer from "./MessageComposer";
import ScheduleField from "./ScheduleField";
import MessagePreview from "./MessagePreview";
import useSendNotificationMutation from "../hooks/useSendNotificationMutation";

const STEPS = [
  { key: "channel", title: "Kanal" },
  { key: "audience", title: "Auditoriya" },
  { key: "content", title: "Kontent" },
  { key: "confirm", title: "Tasdiqlash" },
];

// datetime-local qiymatini ISO ga (mahalliy vaqt sifatida) aylantiradi
const toISO = (local) => (local ? new Date(local).toISOString() : undefined);

const SummaryRow = ({ label, children }) => (
  <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{children}</span>
  </div>
);

/**
 * SendWizard - yangi xabar yuborish oqimi (ModalWrapper ichida).
 * close/isLoading/setIsLoading - ModalWrapper'dan keladi.
 */
const SendWizard = ({ close, isLoading, setIsLoading }) => {
  const { role } = useAuth();
  const isTeacher = role === ROLES.TEACHER;
  const [step, setStep] = useState(0);

  const form = useObjectState({
    channels: ["telegram", "inapp"],
    audienceType: isTeacher ? "groups" : "all_students",
    groupIds: [],
    userIds: [],
    templateId: "",
    title: "",
    body: "",
    category: "announcement",
    scheduleMode: "now",
    scheduleAt: "",
  });

  const audience = {
    type: form.audienceType,
    groupIds: form.groupIds,
    userIds: form.userIds,
  };

  const { mutate } = useSendNotificationMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  // Har qadam validatsiyasi
  const stepValid = useMemo(() => {
    switch (STEPS[step].key) {
      case "channel":
        return form.channels.length > 0;
      case "audience":
        return isAudienceReady(audience);
      case "content":
        if (!form.body.trim()) return false;
        if (form.scheduleMode === "schedule") {
          return !!form.scheduleAt && new Date(form.scheduleAt) > new Date();
        }
        return true;
      default:
        return true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, form.channels, form.audienceType, form.groupIds, form.userIds, form.body, form.scheduleMode, form.scheduleAt]);

  const isLast = step === STEPS.length - 1;
  const scheduled = form.scheduleMode === "schedule";

  const next = () => stepValid && setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const submit = () => {
    setIsLoading(true);
    mutate({
      title: form.title || undefined,
      body: form.body.trim(),
      category: form.category || undefined,
      templateId: form.templateId || undefined,
      channels: form.channels,
      scheduleAt: scheduled ? toISO(form.scheduleAt) : undefined,
      audience: {
        type: form.audienceType,
        ...(form.audienceType === "groups" ? { groupIds: form.groupIds } : {}),
        ...(form.audienceType === "users" || form.audienceType === "individual"
          ? { userIds: form.userIds }
          : {}),
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Stepper */}
      <ol className="flex items-center gap-1.5">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={s.key} className="flex flex-1 items-center gap-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition",
                    active && "bg-primary text-primary-foreground",
                    done && "bg-primary/15 text-primary",
                    !active && !done && "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "hidden text-xs font-medium sm:inline",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.title}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <span
                  className={cn(
                    "h-px flex-1",
                    i < step ? "bg-primary/40" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Step body */}
      <div className="min-h-[260px]">
        {STEPS[step].key === "channel" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Xabar qaysi kanal(lar) orqali yetkazilsin?
            </p>
            <ChannelSelector
              value={form.channels}
              onChange={(v) => form.setField("channels", v)}
              disabled={isLoading}
            />
          </div>
        )}

        {STEPS[step].key === "audience" && (
          <AudienceSelector
            value={audience}
            onChange={(patch) => form.setFields(patch)}
            disabled={isLoading}
          />
        )}

        {STEPS[step].key === "content" && (
          <div className="space-y-4">
            <MessageComposer
              value={{
                templateId: form.templateId,
                title: form.title,
                body: form.body,
                category: form.category,
              }}
              onChange={(patch) => form.setFields(patch)}
              channels={form.channels}
              disabled={isLoading}
            />
            <div className="border-t pt-4">
              <p className="mb-2 text-sm font-medium">Yuborish vaqti</p>
              <ScheduleField
                value={{ mode: form.scheduleMode, scheduleAt: form.scheduleAt }}
                onChange={(patch) =>
                  form.setFields({
                    ...(patch.mode !== undefined ? { scheduleMode: patch.mode } : {}),
                    ...(patch.scheduleAt !== undefined
                      ? { scheduleAt: patch.scheduleAt }
                      : {}),
                  })
                }
                disabled={isLoading}
              />
            </div>
          </div>
        )}

        {STEPS[step].key === "confirm" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="rounded-lg border bg-white p-3">
                <SummaryRow label="Kanallar">
                  {form.channels.map((c) => CHANNEL_LABEL[c]).join(", ")}
                </SummaryRow>
                <SummaryRow label="Auditoriya">
                  {AUDIENCE_TYPE_LABEL[form.audienceType]}
                </SummaryRow>
                <SummaryRow label="Kategoriya">
                  {form.category}
                </SummaryRow>
                <SummaryRow label="Yuborish">
                  {scheduled ? (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <CalendarClock className="size-3.5" />
                      {formatDateTimeUz(form.scheduleAt)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <Send className="size-3.5" />
                      Hozir
                    </span>
                  )}
                </SummaryRow>
              </div>
              <RecipientCountPreview audience={audience} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Xabar ko'rinishi</p>
              {form.channels.includes("telegram") && (
                <MessagePreview
                  title={form.title}
                  body={form.body}
                  category={form.category}
                  variant="telegram"
                />
              )}
              {form.channels.includes("inapp") && (
                <MessagePreview
                  title={form.title}
                  body={form.body}
                  category={form.category}
                  variant="inapp"
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer navigatsiya */}
      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <Button
          type="button"
          variant="outline"
          onClick={step === 0 ? () => close?.() : prev}
          disabled={isLoading}
        >
          {step === 0 ? (
            "Bekor qilish"
          ) : (
            <>
              <ArrowLeft className="size-4" />
              Orqaga
            </>
          )}
        </Button>

        {isLast ? (
          <Button type="button" onClick={submit} disabled={isLoading || !stepValid}>
            {isLoading
              ? "Yuborilmoqda..."
              : scheduled
                ? "Rejalashtirish"
                : "Yuborish"}
            {!isLoading &&
              (scheduled ? (
                <CalendarClock className="size-4" />
              ) : (
                <Send className="size-4" />
              ))}
          </Button>
        ) : (
          <Button type="button" onClick={next} disabled={!stepValid || isLoading}>
            Keyingisi
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default SendWizard;
