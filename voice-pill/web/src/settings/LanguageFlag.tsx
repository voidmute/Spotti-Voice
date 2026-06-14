import type { ComponentType, SVGProps } from "react";
import * as FlagIcons from "country-flag-icons/react/3x2";

type FlagComponent = ComponentType<SVGProps<SVGSVGElement>>;

const FLAG_BY_COUNTRY: Record<string, FlagComponent> = FlagIcons as Record<string, FlagComponent>;

type LanguageFlagProps = {
  country: string;
  className?: string;
};

/** Renders a real flag image (Windows does not draw regional-indicator emoji as flags). */
export function LanguageFlag({ country, className }: LanguageFlagProps) {
  const Flag = FLAG_BY_COUNTRY[country.toUpperCase()];
  if (!Flag) return null;
  return <Flag className={className} aria-hidden focusable="false" />;
}
