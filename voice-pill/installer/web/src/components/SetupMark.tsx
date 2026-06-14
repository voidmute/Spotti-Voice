export function SetupMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      className="setup-chrome-icon"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
    >
      <circle cx="16" cy="16" r="16" fill="#121218" />
      <circle cx="16" cy="16" r="7" fill="#ffffff" />
    </svg>
  );
}
