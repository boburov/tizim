import Card from "@/shared/components/ui/card/Card";
import { Send } from "lucide-react";

const UserTelegramCard = ({ telegram }) => {
  if (!telegram) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
            <Send className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground/80">Telegram</p>
            <p className="text-xs text-muted-foreground">Hali bog'lanmagan</p>
          </div>
        </div>
      </Card>
    );
  }

  const display = [telegram.firstName, telegram.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-500">
          <Send className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Telegram</p>
          <p className="text-sm text-muted-foreground">
            {display || "-"}
            {telegram.username && (
              <span className="ml-1">@{telegram.username}</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            ID: {telegram.telegramId}
          </p>
        </div>
      </div>
    </Card>
  );
};

export default UserTelegramCard;
