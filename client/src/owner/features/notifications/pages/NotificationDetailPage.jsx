import { useParams } from "react-router-dom";
import {
  Users,
  Send,
  Eye,
  AlertTriangle,
  Smartphone,
} from "lucide-react";
import Card from "@/shared/components/ui/card/Card";
import BackLink from "@/shared/components/ui/link/BackLink";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";
import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import useGoBack from "@/shared/hooks/useGoBack";
import { cn } from "@/shared/utils/cn";
import { formatDateTimeUz } from "@/shared/utils/formatDate";
import {
  AUDIENCE_TYPE_LABEL,
  fillSampleVariables,
} from "@/shared/constants/notification";

import CategoryBadge from "../components/CategoryBadge";
import ChannelIcons from "../components/ChannelIcons";
import NotificationStatusBadge from "../components/NotificationStatusBadge";
import RecipientsTable from "../components/RecipientsTable";
import {
  useNotificationDetailQuery,
  useNotificationRecipientsQuery,
} from "../hooks/useNotificationDetailQuery";

const InfoRow = ({ label, children }) => (
  <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{children || "-"}</span>
  </div>
);

// Bullet (•, -, *, –) bilan boshlanadigan qator - ro'yxat elementimi?
const LIST_LINE = /^\s*[•\-*–]\s+/;
const stripBullet = (line) => line.replace(LIST_LINE, "").trim();

/**
 * MessageBody - xabar matnini chiroyli ko'rsatadi.
 * Ketma-ket bullet qatorlar (•/-/*) RAQAMLI ro'yxatga aylanadi (1. 2. 3. ...),
 * qolgan qatorlar oddiy paragraf bo'lib qoladi. Quruq "•" devori o'rniga toza ko'rinish.
 */
const MessageBody = ({ text }) => {
  const lines = String(text || "").split("\n");

  const blocks = [];
  let listBuf = [];
  const flushList = () => {
    if (listBuf.length) {
      blocks.push({ type: "list", items: listBuf });
      listBuf = [];
    }
  };

  lines.forEach((raw) => {
    if (LIST_LINE.test(raw)) {
      listBuf.push(stripBullet(raw));
    } else {
      flushList();
      blocks.push({ type: "text", value: raw });
    }
  });
  flushList();

  return (
    <div className="space-y-2 text-[15px] leading-relaxed text-slate-800">
      {blocks.map((b, i) =>
        b.type === "list" ? (
          <ol key={i} className="space-y-1.5">
            {b.items.map((item, j) => (
              <li key={j} className="flex gap-2.5">
                <span className="min-w-[1.75rem] shrink-0 text-right font-semibold tabular-nums text-slate-400">
                  {j + 1}.
                </span>
                <span className="break-words">{item}</span>
              </li>
            ))}
          </ol>
        ) : b.value.trim() === "" ? (
          // bo'sh qatorni kichik bo'shliq sifatida saqlaymiz
          <div key={i} className="h-1" />
        ) : (
          <p key={i} className="whitespace-pre-wrap break-words">
            {b.value}
          </p>
        ),
      )}
    </div>
  );
};

/**
 * MessageBubble - yuborilgan xabarni qabul qiluvchi ko'rgan ko'rinishda
 * ko'rsatadi (telegram chat pufakchasi yoki ilova ichidagi bildirishnoma
 * kartasi). Quruq matn o'rniga - bu "xabar" ekanligi darhol bilinadi.
 */
const MessageBubble = ({ title, body, sentAt, variant }) => {
  const filledTitle = fillSampleVariables(title || "");
  const filledBody = fillSampleVariables(body || "");
  const time = sentAt ? formatDateTimeUz(sentAt) : "";

  if (variant === "inapp") {
    return (
      <div className="rounded-xl border bg-white p-3.5 shadow-sm">
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-500">
            <Smartphone className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            {filledTitle && (
              <p className="text-base font-semibold text-slate-900">
                {filledTitle}
              </p>
            )}
            <div className="mt-1">
              <MessageBody text={filledBody} />
            </div>
            {time && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">{time}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Telegram chat ko'rinishi
  return (
    <div className="rounded-xl bg-[#e7ebf0] p-3.5">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        <Send className="size-3" />
        Telegram bot
      </div>
      <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm">
        {filledTitle && (
          <p className="mb-1.5 text-base font-semibold text-slate-900">
            {filledTitle}
          </p>
        )}
        <MessageBody text={filledBody} />
        {time && (
          <p className="mt-1.5 text-right text-[10px] text-slate-400">{time}</p>
        )}
      </div>
    </div>
  );
};

const pct = (part, whole) =>
  whole > 0 ? Math.round((Number(part) / Number(whole)) * 100) : 0;

/**
 * StatTile - neytral stat karta (hammasi bir xil uslubda).
 * Faqat ikonka rang beradi; nisbat kichik progress bilan ko'rsatiladi.
 */
const StatTile = ({ icon: Icon, iconClass, label, value, ratioPct, ratioTone }) => (
  <Card className="space-y-2">
    <div className="flex items-center justify-between">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <Icon className={cn("size-4", iconClass)} />
    </div>
    <p className="text-2xl font-semibold tabular-nums">{value ?? 0}</p>
    {ratioPct != null && (
      <div className="space-y-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", ratioTone)}
            style={{ width: `${ratioPct}%` }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {ratioPct}% qabul qiluvchilardan
        </p>
      </div>
    )}
  </Card>
);

const audienceTargets = (notif) => {
  const a = notif.audience;
  if (!a) return null;
  if (a.type === "groups" && a.groupIds?.length)
    return a.groupIds.map((g) => g.name).join(", ");
  if (
    (a.type === "users" || a.type === "individual") &&
    a.userIds?.length
  )
    return a.userIds
      .map((u) => `${u.firstName} ${u.lastName}`)
      .join(", ");
  return null;
};

const NotificationDetailPage = ({ backTo = "/owner/notifications" }) => {
  const { id } = useParams();
  const goBack = useGoBack(backTo);
  const { data: notif, isLoading } = useNotificationDetailQuery(id);
  const { data: recipientsData, isLoading: recLoading } =
    useNotificationRecipientsQuery(id, { limit: 200 });
  const recipients = recipientsData?.data || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-3 lg:grid-cols-3">
          <Skeleton className="h-40 lg:col-span-2" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-60" />
      </div>
    );
  }

  if (!notif) {
    return (
      <EmptyState
        title="Xabar topilmadi"
        description="So'ralgan xabar mavjud emas yoki o'chirilgan."
        action={
          <button
            type="button"
            onClick={goBack}
            className="text-primary hover:underline"
          >
            Bildirishnomalarga qaytish
          </button>
        }
      />
    );
  }

  const targets = audienceTargets(notif);

  const channels = notif.channels || [];
  const usesTelegram = channels.includes("telegram");
  const unlinkedCount = recipients.filter(
    (r) => r.botFailedReason === "no-bot-link",
  ).length;
  const showBotWarning = usesTelegram && unlinkedCount > 0;

  const recipientsCount = notif.recipientsCount || 0;
  const deliveredViaBot = notif.deliveredViaBot || 0;
  const readCount = notif.readCount || 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3">
        <BackLink to={backTo} />
        <h1 className="text-2xl font-semibold">{notif.title || "Xabar"}</h1>
        <CategoryBadge category={notif.category} />
        <NotificationStatusBadge status={notif.status} isAuto={notif.isAuto} />
      </header>

      {/* Matn + Meta */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="space-y-3 lg:col-span-2">
          <h3 className="font-semibold">Xabar ko'rinishi</h3>
          <p className="-mt-1 text-xs text-muted-foreground">
            Qabul qiluvchilarga shu ko'rinishda yetkazildi
          </p>
          <div className="space-y-3">
            {channels.includes("telegram") && (
              <MessageBubble
                title={notif.title}
                body={notif.body}
                category={notif.category}
                sentAt={notif.sentAt || notif.scheduleAt}
                variant="telegram"
              />
            )}
            {channels.includes("inapp") && (
              <MessageBubble
                title={notif.title}
                body={notif.body}
                category={notif.category}
                sentAt={notif.sentAt || notif.scheduleAt}
                variant="inapp"
              />
            )}
            {channels.length === 0 && (
              <MessageBubble
                title={notif.title}
                body={notif.body}
                category={notif.category}
                sentAt={notif.sentAt || notif.scheduleAt}
                variant="inapp"
              />
            )}
          </div>
          {notif.template && (
            <p className="text-xs text-muted-foreground">
              Shablon asosida:{" "}
              <span className="font-medium">{notif.template.name}</span>
            </p>
          )}
        </Card>

        <Card className="space-y-1">
          <h3 className="mb-1 font-semibold">Ma'lumot</h3>
          <InfoRow label="Yuboruvchi">
            {notif.sender
              ? `${notif.sender.firstName} ${notif.sender.lastName}`
              : "Tizim"}
          </InfoRow>
          <InfoRow label="Auditoriya">
            {AUDIENCE_TYPE_LABEL[notif.audience?.type]}
          </InfoRow>
          {targets && <InfoRow label="Maqsad">{targets}</InfoRow>}
          <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span className="text-muted-foreground">Kanallar</span>
            <ChannelIcons channels={notif.channels} />
          </div>
          <InfoRow label={notif.status === "scheduled" ? "Rejalashtirilgan" : "Yuborilgan"}>
            {formatDateTimeUz(notif.scheduleAt || notif.sentAt)}
          </InfoRow>
          <InfoRow label="Avto-yuborilgan">
            {notif.isAuto ? "Ha" : "Yo'q"}
          </InfoRow>
        </Card>
      </div>

      {/* Stat kartalar - bir xil neytral uslub, rangni faqat ikonka beradi */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={Users}
          iconClass="text-muted-foreground"
          label="Qabul qiluvchilar"
          value={recipientsCount}
        />
        <StatTile
          icon={Send}
          iconClass="text-sky-600"
          label="Bot orqali yetkazildi"
          value={deliveredViaBot}
          ratioPct={pct(deliveredViaBot, recipientsCount)}
          ratioTone="bg-sky-500"
        />
        <StatTile
          icon={Eye}
          iconClass="text-emerald-600"
          label="O'qilgan"
          value={readCount}
          ratioPct={pct(readCount, recipientsCount)}
          ratioTone="bg-emerald-500"
        />
      </div>

      {/* Bot ulanmaganlar ogohlantirishi */}
      {showBotWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>{unlinkedCount}</strong> ta foydalanuvchi Telegram botga
            ulanmagan - ularga xabar faqat platformada ko'rinadi.
          </span>
        </div>
      )}

      {/* Qabul qiluvchilar */}
      <div className="space-y-2">
        <h3 className="font-semibold">Qabul qiluvchilar</h3>
        <RecipientsTable items={recipients} isLoading={recLoading} />
      </div>
    </div>
  );
};

export default NotificationDetailPage;
