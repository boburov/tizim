import { useRef } from "react";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import {
  MESSAGE_VARIABLES,
  CATEGORY_OPTIONS,
} from "@/shared/constants/notification";
import { cn } from "@/shared/utils/cn";

import TemplatePicker from "./TemplatePicker";
import MessagePreview from "./MessagePreview";

/**
 * MessageComposer - kontent qadami: shablon, sarlavha, matn + o'zgaruvchi
 * tugmalari va jonli preview (Telegram / in-app).
 *
 * value: { templateId, title, body, category }, onChange(patch)
 */
const MessageComposer = ({ value, onChange, channels = [], disabled = false }) => {
  const { templateId, title, body, category } = value;
  const textareaRef = useRef(null);

  const handleTemplate = (id, tpl) => {
    onChange({
      templateId: id,
      ...(tpl ? { body: tpl.body } : {}),
    });
  };

  // O'zgaruvchini kursor o'rniga (yoki oxiriga) qo'shadi
  const insertVar = (token) => {
    const el = textareaRef.current;
    if (!el) {
      onChange({ body: `${body}${token}` });
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    onChange({ body: next });
    // kursorni token oxiriga qo'yamiz
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const showTelegram = channels.includes("telegram");
  const showInapp = channels.includes("inapp");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Chap: forma */}
      <div className="space-y-3">
        <TemplatePicker
          value={templateId}
          onChange={handleTemplate}
          disabled={disabled}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InputField
            name="title"
            label="Sarlavha (ixtiyoriy)"
            placeholder="Masalan: To'lov eslatmasi"
            value={title}
            onChange={(e) => onChange({ title: e.target.value })}
            disabled={disabled}
          />
          <SelectField
            label="Kategoriya"
            value={category}
            onChange={(v) => onChange({ category: v })}
            options={CATEGORY_OPTIONS}
            disabled={disabled}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Matn <span className="text-primary">*</span>
          </label>
          <textarea
            ref={textareaRef}
            rows={6}
            className={cn(
              "w-full rounded-[2px] border border-input bg-white px-3 py-2 text-sm outline-2 outline-primary",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            placeholder="Xabar matnini yozing yoki shablon tanlang..."
            value={body}
            onChange={(e) => onChange({ body: e.target.value })}
            disabled={disabled}
            maxLength={2000}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {body.length}/2000
            </p>
          </div>

          {/* O'zgaruvchilar */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              O'zgaruvchi qo'shish (avtomatik to'ldiriladi):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MESSAGE_VARIABLES.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  disabled={disabled}
                  onClick={() => insertVar(v.token)}
                  className="rounded-md border bg-muted/50 px-2 py-1 text-xs font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                  title={`${v.label} → ${v.sample}`}
                >
                  {v.token}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* O'ng: jonli preview */}
      <div className="space-y-3">
        <p className="text-sm font-medium">Ko'rinishi</p>
        {showTelegram && (
          <MessagePreview
            title={title}
            body={body}
            category={category}
            variant="telegram"
          />
        )}
        {showInapp && (
          <MessagePreview
            title={title}
            body={body}
            category={category}
            variant="inapp"
          />
        )}
        {!showTelegram && !showInapp && (
          <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-xs text-muted-foreground">
            Kanal tanlang - preview shu yerda ko'rinadi.
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageComposer;
