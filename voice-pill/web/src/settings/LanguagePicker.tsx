import { Check, Sparkles, Wand2 } from "lucide-react";
import { VOICE_LANGUAGES, normalizeLanguageCode } from "./voiceLanguages";
import { LanguageFlag } from "./LanguageFlag";

type LanguagePickerProps = {
  value: string;
  onChange: (code: string) => void;
};

const MANUAL_LANGUAGES = VOICE_LANGUAGES.filter((lang) => !lang.magical);

export function LanguagePicker({ value, onChange }: LanguagePickerProps) {
  const active = normalizeLanguageCode(value);
  const isAuto = active === "auto";

  return (
    <div className="settings-lang">
      <button
        type="button"
        className={`settings-lang-auto${isAuto ? " is-active" : ""}`}
        aria-pressed={isAuto}
        onClick={() => onChange("auto")}
      >
        <span className="settings-lang-auto__glow" aria-hidden />
        <span className="settings-lang-auto__icon" aria-hidden>
          <Sparkles size={22} strokeWidth={2} />
        </span>
        <span className="settings-lang-auto__copy">
          <span className="settings-lang-auto__title">
            <Wand2 size={14} strokeWidth={2.25} aria-hidden />
            Автоопределение
          </span>
          <span className="settings-lang-auto__desc">Язык подбирается автоматически по речи</span>
        </span>
        <span className="settings-lang-auto__check" aria-hidden>
          <Check size={14} strokeWidth={3} />
        </span>
      </button>

      <div className="settings-lang-grid" role="listbox" aria-label="Язык речи">
        {MANUAL_LANGUAGES.map((lang) => {
          const isActive = active === lang.code;

          return (
            <button
              key={lang.code}
              type="button"
              role="option"
              aria-selected={isActive}
              className={`settings-lang-chip${isActive ? " is-active" : ""}`}
              title={lang.label}
              onClick={() => onChange(lang.code)}
            >
              <span className="settings-lang-chip__media" aria-hidden>
                {lang.flagCountry ? (
                  <LanguageFlag country={lang.flagCountry} className="settings-lang-chip__flag" />
                ) : null}
              </span>
              <span className="settings-lang-chip__label">{lang.label}</span>
              <span className="settings-lang-chip__check" aria-hidden>
                <Check size={11} strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
