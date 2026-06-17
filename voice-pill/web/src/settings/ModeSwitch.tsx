import { useCallback, useRef, useState } from "react";
import { Cloud, HardDrive } from "lucide-react";

export type SttMode = "cloud" | "local";

type ModeSwitchProps = {
  value: SttMode;
  onChange: (mode: SttMode) => void;
  disabled?: boolean;
};

const SEGMENTS: { id: SttMode; label: string; icon: typeof Cloud }[] = [
  { id: "cloud", label: "Облако", icon: Cloud },
  { id: "local", label: "Локально", icon: HardDrive },
];

export function ModeSwitch({ value, onChange, disabled }: ModeSwitchProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<SttMode | null>(null);
  const [dragging, setDragging] = useState(false);

  const pillTarget = dragging ? hover ?? value : hover ?? value;

  const segmentFromPoint = useCallback((clientX: number): SttMode | null => {
    const track = trackRef.current;
    if (!track) return null;
    const rect = track.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    return clientX < mid ? "cloud" : "local";
  }, []);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    const seg = segmentFromPoint(event.clientX);
    if (!seg) return;
    setDragging(true);
    setHover(seg);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || disabled) return;
    const seg = segmentFromPoint(event.clientX);
    if (seg) setHover(seg);
  }

  function commitPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    const seg = segmentFromPoint(event.clientX) ?? hover ?? value;
    setHover(null);
    if (seg !== value) onChange(seg);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }

  function onSegmentClick(mode: SttMode) {
    if (disabled || mode === value) return;
    onChange(mode);
  }

  return (
    <div
      ref={trackRef}
      className={`mode-switch${disabled ? " is-disabled" : ""}${dragging ? " is-dragging" : ""}`}
      role="group"
      aria-label="Режим распознавания"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={commitPointer}
      onPointerCancel={commitPointer}
      onPointerLeave={() => {
        if (!dragging) setHover(null);
      }}
    >
      <span
        className="mode-switch__pill"
        data-position={pillTarget}
        aria-hidden
      />
      {SEGMENTS.map((seg) => {
        const Icon = seg.icon;
        const active = value === seg.id;
        const preview = pillTarget === seg.id;
        return (
          <button
            key={seg.id}
            type="button"
            className={`mode-switch__seg${active ? " is-active" : ""}${preview ? " is-preview" : ""}`}
            aria-pressed={active}
            disabled={disabled}
            onMouseEnter={() => !dragging && setHover(seg.id)}
            onMouseLeave={() => !dragging && setHover(null)}
            onClick={() => onSegmentClick(seg.id)}
          >
            <Icon size={15} strokeWidth={2.25} aria-hidden />
            <span>{seg.label}</span>
          </button>
        );
      })}
    </div>
  );
}
