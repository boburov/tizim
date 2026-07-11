import { Send, Smartphone } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { CHANNEL_SHORT_LABEL } from "@/shared/constants/notification";

const META = {
  telegram: { icon: Send, className: "border-sky-200 bg-sky-50 text-sky-700" },
  inapp: {
    icon: Smartphone,
    className: "border-violet-200 bg-violet-50 text-violet-700",
  },
};

// Bitta kanal chipi
export const ChannelChip = ({ channel }) => {
  const meta = META[channel];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-xs font-medium leading-none",
        meta.className,
      )}
    >
      <Icon className="size-3 shrink-0" />
      {CHANNEL_SHORT_LABEL[channel]}
    </span>
  );
};

// Bir nechta kanalni bir qatorda ko'rsatadi (sinmaydi)
const ChannelBadge = ({ channels = [] }) => {
  const list = channels?.length ? channels : ["inapp", "telegram"];
  return (
    <div className="flex flex-wrap items-center gap-1">
      {list.map((c) => (
        <ChannelChip key={c} channel={c} />
      ))}
    </div>
  );
};

export default ChannelBadge;
