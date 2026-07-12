import { useMemo } from "react";

interface ReadinessRingProps {
  /** 0..1 */
  value: number;
  /** ring diameter in px */
  size?: number;
  /** stroke width in px */
  stroke?: number;
  /** Center label. Defaults to the percentage. */
  label?: string;
  /** Small eyebrow beneath the label. */
  caption?: string;
  /** Set true for the mini version in the call header (hides caption). */
  compact?: boolean;
}

/**
 * The signature element of Tele-Exit — a calm clock-face progress ring
 * showing exam readiness. Amber arc on ink-navy track, on paper.
 */
export function ReadinessRing({
  value,
  size = 220,
  stroke = 14,
  label,
  caption = "Readiness",
  compact = false,
}: ReadinessRingProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const pct = Math.round(clamped * 100);

  const { r, c, dash } = useMemo(() => {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const dash = c * clamped;
    return { r, c, dash };
  }, [size, stroke, clamped]);

  const displayLabel = label ?? `${pct}%`;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Exam readiness ${pct} percent`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--ink)"
          strokeOpacity={0.12}
          strokeWidth={stroke}
        />
        {/* Progress arc — starts at 12 o'clock */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--amber)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 480ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className="font-display text-primary"
          style={{ fontSize: compact ? size * 0.32 : size * 0.26, lineHeight: 1 }}
        >
          {displayLabel}
        </span>
        {!compact && caption && (
          <span className="eyebrow mt-2">{caption}</span>
        )}
      </div>
    </div>
  );
}
