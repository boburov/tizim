// Utils
import { ROLE_PRESETS, applyPreset } from "../utils/presets";

// Tayyor shablonlar. Bosilganda avvalgi tanlov to'liq almashtiriladi -
// shuning uchun bu "boshlang'ich nuqta", keyin qo'lda aniqlashtiriladi.
const RolePresetPicker = ({ modules = [], onApply, disabled = false }) => {
  if (!modules.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Tayyor shablondan boshlash
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ROLE_PRESETS.map((preset) => {
          const Icon = preset.icon;
          return (
            <button
              key={preset.key}
              type="button"
              disabled={disabled}
              onClick={() => onApply(applyPreset(preset, modules))}
              className="flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{preset.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {preset.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RolePresetPicker;
