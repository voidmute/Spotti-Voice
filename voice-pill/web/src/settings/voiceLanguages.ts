export type VoiceLanguageOption = {
  code: string;
  label: string;
  /** ISO 3166-1 alpha-2 country code for flag SVG (not the STT language code). */
  flagCountry?: string;
  magical?: boolean;
};

/** Whisper / OpenAI STT language codes exposed in setup. */
export const VOICE_LANGUAGES: VoiceLanguageOption[] = [
  { code: "auto", label: "Авто", magical: true },
  { code: "ru", label: "Русский", flagCountry: "RU" },
  { code: "en", label: "English", flagCountry: "US" },
  { code: "uk", label: "Українська", flagCountry: "UA" },
  { code: "de", label: "Deutsch", flagCountry: "DE" },
  { code: "fr", label: "Français", flagCountry: "FR" },
  { code: "es", label: "Español", flagCountry: "ES" },
  { code: "it", label: "Italiano", flagCountry: "IT" },
  { code: "pt", label: "Português", flagCountry: "PT" },
  { code: "pl", label: "Polski", flagCountry: "PL" },
  { code: "tr", label: "Türkçe", flagCountry: "TR" },
  { code: "zh", label: "中文", flagCountry: "CN" },
  { code: "ja", label: "日本語", flagCountry: "JP" },
  { code: "ko", label: "한국어", flagCountry: "KR" },
];

export function languageFlagCountry(code: string): string | undefined {
  return VOICE_LANGUAGES.find((l) => l.code === code)?.flagCountry;
}

export function normalizeLanguageCode(code: string): string {
  const trimmed = code.trim().toLowerCase();
  if (!trimmed || trimmed === "auto") return "auto";
  const known = VOICE_LANGUAGES.find((l) => l.code === trimmed);
  return known ? known.code : trimmed;
}
