import type { CSSProperties } from "react";

/**
 * Foresight mark — a rising momentum arc that sweeps cool → hot, with a bright
 * predictive spark breaking *ahead* of the curve and a dotted trajectory where
 * the market will follow. It draws the product thesis: you see the surge before
 * the odds catch up. Neon treatment for the dark broadcast UI.
 */
export function FsMark({
  size = 40,
  className,
  style,
  animated = false,
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
  animated?: boolean;
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
          <stop offset="0" stopColor="#21E5FF" />
          <stop offset="0.5" stopColor="#FFC233" />
          <stop offset="1" stopColor="#FF2E6E" />
        </linearGradient>
        <radialGradient id="fsOrb" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.45" stopColor="#FF7AA8" />
          <stop offset="1" stopColor="#FF2E6E" />
        </radialGradient>
      </defs>

      {/* Faint full gauge track */}
      <path
        d="M15.74 49.26 A23 23 0 1 1 48.26 49.26"
        fill="none"
        stroke="#21E5FF"
        strokeOpacity="0.14"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* The momentum curve so far — cool → hot, glowing */}
      <path
        d="M15.74 49.26 A23 23 0 0 1 45.19 14.16"
        fill="none"
        stroke="url(#fsArc)"
        strokeWidth="5"
        strokeLinecap="round"
        pathLength={100}
        style={{
          filter: "drop-shadow(0 0 3px rgba(33,229,255,0.5)) drop-shadow(0 0 4px rgba(255,46,110,0.45))",
          ...(animated
            ? { strokeDasharray: 100, animation: "arc-draw 1.1s cubic-bezier(0.2,0.9,0.3,1) both" }
            : null),
        }}
      />

      {/* Predicted trajectory — where the market is about to go */}
      <g fill="#FF2E6E">
        {[
          { cx: 50.5, cy: 10.4, r: 1.5, o: 0.6 },
          { cx: 55, cy: 8.2, r: 1.2, o: 0.4 },
          { cx: 59, cy: 7, r: 1, o: 0.25 },
        ].map((d, i) => (
          <circle
            key={i}
            cx={d.cx}
            cy={d.cy}
            r={d.r}
            opacity={d.o}
            style={
              animated
                ? { animation: `trail-twinkle 1.6s ease-in-out ${i * 0.2}s infinite` }
                : undefined
            }
          />
        ))}
      </g>

      {/* The signal — the spark you see coming, ahead of the curve */}
      <g
        style={{
          transformBox: "fill-box",
          transformOrigin: "center",
          filter: "drop-shadow(0 0 5px rgba(255,46,110,0.85))",
          ...(animated ? { animation: "orb-pulse 1.7s ease-in-out infinite" } : null),
        }}
      >
        <circle cx="45.19" cy="14.16" r="5.4" fill="url(#fsOrb)" />
        <circle cx="45.19" cy="14.16" r="2" fill="#FFFFFF" />
      </g>
    </svg>
  );
}

export function FsLockup({
  size = 40,
  className,
  animated = false,
  gradient = false,
}: {
  size?: number;
  className?: string;
  animated?: boolean;
  gradient?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <FsMark size={size} animated={animated} />
      <span
        className="font-display font-semibold uppercase leading-none"
        style={{
          fontSize: size * 0.5,
          letterSpacing: "0.16em",
          ...(gradient
            ? {
                backgroundImage: "linear-gradient(90deg, #eaf0fb 30%, #21E5FF)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }
            : { color: "var(--color-ink)" }),
        }}
      >
        Foresight
      </span>
    </span>
  );
}
