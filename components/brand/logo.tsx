import type { CSSProperties } from "react";

/**
 * Foresight mark — a momentum gauge whose stroke runs cool -> hot and ends in
 * a bright orb that sits *ahead* of the curve (the signal you see coming).
 * On-light treatment: dark hairline baseline, deepened gradient, no glow.
 */
export function FsMark({
  size = 40,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      style={style}
      role="img"
      aria-label="Foresight"
    >
      <defs>
        <linearGradient id="fsArc" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0EA5C4" />
          <stop offset="0.5" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#F2542D" />
        </linearGradient>
      </defs>
      <path
        d="M15.74 49.26 A23 23 0 1 1 48.26 49.26"
        fill="none"
        stroke="#0A0E14"
        strokeOpacity="0.12"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M15.74 49.26 A23 23 0 0 1 45.19 14.16"
        fill="none"
        stroke="url(#fsArc)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="45.19" cy="14.16" r="5" fill="#F2542D" />
      <circle cx="45.19" cy="14.16" r="2.1" fill="#FFFFFF" />
    </svg>
  );
}

export function FsLockup({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ""}`}>
      <FsMark size={size} />
      <span
        className="font-display font-medium tracking-tight text-ink"
        style={{ fontSize: size * 0.66 }}
      >
        Foresight
      </span>
    </span>
  );
}
