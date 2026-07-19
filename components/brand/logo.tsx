import type { CSSProperties } from "react";

/**
 * Foresight mark — a football-crest hexagon holding a live-signal pulse that
 * rises and spikes into a bright predictive spark, whose trajectory (fading
 * dots) breaks *past* the crest edge: you see beyond the play, before the odds
 * catch up. Neon treatment for the dark broadcast UI.
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
        <linearGradient id="fsCrest" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#21E5FF" stopOpacity="0.7" />
          <stop offset="1" stopColor="#FF2E6E" stopOpacity="0.7" />
        </linearGradient>
        <radialGradient id="fsCrestFill" cx="0.5" cy="0.32" r="0.85">
          <stop offset="0" stopColor="#21E5FF" stopOpacity="0.16" />
          <stop offset="0.6" stopColor="#0e1a2e" stopOpacity="0.35" />
          <stop offset="1" stopColor="#0e1a2e" stopOpacity="0.05" />
        </radialGradient>
        <radialGradient id="fsOrb" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.45" stopColor="#FF7AA8" />
          <stop offset="1" stopColor="#FF2E6E" />
        </radialGradient>
      </defs>

      {/* Crest badge */}
      <polygon
        points="19,10 45,10 57,32 45,54 19,54 7,32"
        fill="url(#fsCrestFill)"
        stroke="url(#fsCrest)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />

      {/* Live-signal pulse rising to the spark */}
      <polyline
        points="14,38 22,38 26,41 30,35 34,43 40,20"
        fill="none"
        stroke="url(#fsArc)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={100}
        style={{
          filter: "drop-shadow(0 0 2.5px rgba(33,229,255,0.55)) drop-shadow(0 0 3px rgba(255,46,110,0.5))",
          ...(animated
            ? { strokeDasharray: 100, animation: "arc-draw 1.1s cubic-bezier(0.2,0.9,0.3,1) both" }
            : null),
        }}
      />

      {/* Predicted trajectory — breaking past the crest edge */}
      <g fill="#FF2E6E">
        {[
          { cx: 45, cy: 15, r: 1.5, o: 0.6 },
          { cx: 50, cy: 10, r: 1.2, o: 0.4 },
          { cx: 55, cy: 6, r: 1, o: 0.24 },
        ].map((d, i) => (
          <circle
            key={i}
            cx={d.cx}
            cy={d.cy}
            r={d.r}
            opacity={d.o}
            style={animated ? { animation: `trail-twinkle 1.6s ease-in-out ${i * 0.2}s infinite` } : undefined}
          />
        ))}
      </g>

      {/* The spark — the signal you see coming */}
      <g
        style={{
          transformBox: "fill-box",
          transformOrigin: "center",
          filter: "drop-shadow(0 0 5px rgba(255,46,110,0.85))",
          ...(animated ? { animation: "orb-pulse 1.7s ease-in-out infinite" } : null),
        }}
      >
        <circle cx="40" cy="20" r="5" fill="url(#fsOrb)" />
        <circle cx="40" cy="20" r="1.9" fill="#FFFFFF" />
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
                backgroundImage: "linear-gradient(90deg, #eef3fc 30%, #21E5FF)",
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
