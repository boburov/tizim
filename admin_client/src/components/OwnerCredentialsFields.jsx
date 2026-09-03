import { useState } from 'react';
import { Eye, EyeOff, KeyRound, RefreshCw } from 'lucide-react';
import {
  DEFAULT_PASSWORD_LENGTH,
  PASSWORD_MIN,
  USERNAME_RULE,
  generatePassword,
} from '../lib/password';

/**
 * LOYIHA EGASI — LOGIN VA PAROL.
 *
 * ⚠ Bu maydonlar MAJBURIY. Ilgari provisioning hech qanday foydalanuvchi
 * yaratmasdi va yangi loyihaga kirishning umuman yo'li yo'q edi: mijoz
 * ishlaydigan domen olardi-yu, login/parolsiz qolardi.
 *
 * Parol ochiq ko'rinadi (ko'z tugmasi bilan) — mijoz tizimida parollar
 * baribir ochiq matnda saqlanadi, ya'ni uni yashirish faqat yolg'on
 * xavfsizlik hissi berardi.
 */
export default function OwnerCredentialsFields({ value, onChange, disabled }) {
  const [visible, setVisible] = useState(false);

  const set = (k) => (e) => onChange((f) => ({ ...f, [k]: e.target.value }));

  const usernameBad =
    value.ownerUsername.length > 0 && !USERNAME_RULE.test(value.ownerUsername);
  const passwordBad =
    value.ownerPassword.length > 0 && value.ownerPassword.length < PASSWORD_MIN;

  const field =
    'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';
  const label = 'mb-1 block text-sm font-medium text-foreground';

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Login *</label>
          <input
            className={field}
            value={value.ownerUsername}
            onChange={set('ownerUsername')}
            placeholder="owner"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            required
          />
          {usernameBad && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              3-32 belgi: kichik harf, raqam, nuqta, tire yoki pastki chiziq
            </p>
          )}
        </div>

        <div>
          <label className={label}>Parol *</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                className={`${field} pr-9 font-mono`}
                type={visible ? 'text' : 'password'}
                value={value.ownerPassword}
                onChange={set('ownerPassword')}
                autoComplete="new-password"
                spellCheck={false}
                disabled={disabled}
                required
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                title={visible ? 'Yashirish' : "Ko'rsatish"}
              >
                {visible ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange((f) => ({
                  ...f,
                  ownerPassword: generatePassword(DEFAULT_PASSWORD_LENGTH),
                }));
                setVisible(true);
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
              title="Tasodifiy parol yaratish"
            >
              <RefreshCw size={14} /> Generate
            </button>
          </div>
          {passwordBad && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Kamida {PASSWORD_MIN} belgi
            </p>
          )}
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <KeyRound size={13} className="mt-0.5 shrink-0" />
        <span>
          Bu ma'lumot bilan mijoz o'z tizimiga kiradi. Keyinchalik loyiha
          sahifasidan istalgan paytda ko'rish va almashtirish mumkin.
        </span>
      </p>
    </div>
  );
}

/** Forma yuborishga tayyormi — sahifa ham, karta ham shu tekshiruvni ishlatadi. */
export const ownerCredentialsValid = (v) =>
  USERNAME_RULE.test(v.ownerUsername) && v.ownerPassword.length >= PASSWORD_MIN;
