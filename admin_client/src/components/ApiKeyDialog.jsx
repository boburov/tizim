import { useState } from 'react';
import { Check, Copy, KeyRound, TriangleAlert, X } from 'lucide-react';

/**
 * Yangi yaratilgan API kalitini KO'RSATADIGAN yagona joy.
 *
 * Kalit bazada hash holida yotadi, shuning uchun bu oyna yopilgach uni
 * hech kim — admin ham — qayta ko'ra olmaydi. Shu sababli oyna ataylab
 * "qo'rqinchli": ogohlantirish, nusxa olish tugmasi va yopish tasdig'i.
 */
export default function ApiKeyDialog({ apiKey, onClose }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API yo'q (http yoki eski brauzer) — matnni belgilab qo'yamiz
      const el = document.getElementById('api-key-value');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <KeyRound size={18} className="text-brand" /> API kalit yaratildi
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <TriangleAlert size={17} className="mt-0.5 shrink-0" />
          <span>
            Bu kalit <b>faqat hozir</b> ko'rinadi. Oynani yopgandan keyin uni
            tiklab bo'lmaydi — hoziroq nusxa olib, xavfsiz joyga saqlang.
          </span>
        </div>

        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted p-3">
          <code
            id="api-key-value"
            className="min-w-0 flex-1 break-all font-mono text-sm"
          >
            {apiKey}
          </code>
          <button
            onClick={copy}
            title="Nusxa olish"
            className="shrink-0 rounded-lg bg-brand px-3 py-2 text-primary-foreground transition hover:bg-brand-dark"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>

        <div className="mb-4 rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">Ishlatish:</div>
          <code className="block break-all font-mono">
            curl -H "X-API-Key: {apiKey.slice(0, 14)}…" \<br />
            &nbsp;&nbsp;-F audio=@word.wav -F word=hello -F language=en-us \<br />
            &nbsp;&nbsp;https://speech.sevenedu.org/assess
          </code>
        </div>

        <button
          onClick={onClose}
          className="w-full rounded-lg border border-border py-2 text-sm font-medium transition hover:bg-muted"
        >
          Nusxa oldim, yopish
        </button>
      </div>
    </div>
  );
}
