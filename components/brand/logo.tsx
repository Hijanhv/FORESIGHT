import type { CSSProperties } from "react";

/**
 * Foresight mark — a pixel bar-chart of ascending "momentum" columns that heat
 * up as they rise (blue → red), with a detached red spark breaking above the
 * tallest column: the signal you see coming, before the market catches up.
 * Pixel-native, editorial, thermal-mapped. Inspired by craft.wild.as.
 */

// heat colour per row height level (0 = bottom/cool … 5 = top/hot)
const LEVELS = ["#2B5CFF", "#12B6D6", "#A6E22E", "#FFBC1F", "#FF7A1A", "#FF2E3F"];

// ascending columns: heights 1..6 (cells)
const COLS = [1, 2, 3, 4, 5, 6];
const PITCH = 8;
const SIZE = 6.6;
const BASE = 55; // baseline y

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
      shapeRendering="crispEdges"
    >
      {COLS.map((h, c) => {
        const x = 6 + c * PITCH;
        return Array.from({ length: h }, (_, r) => (
          <rect
            key={`${c}-${r}`}
            x={x}
            y={BASE - (r + 1) * PITCH}
            width={SIZE}
            height={SIZE}
            fill={LEVELS[r]}
          />
        ));
      })}
      {/* the spark — ahead of and above the tallest column */}
      <rect x={6 + 6 * PITCH} y={BASE - 6 * PITCH - 2} width={SIZE} height={SIZE} fill="#FF2E3F" />
      <rect x={6 + 6 * PITCH + 1.8} y={BASE - 6 * PITCH - 0.2} width={3} height={3} fill="#FFFFFF" />
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
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <FsMark size={size} />
      <span
        className="font-display uppercase text-ink"
        style={{ fontSize: size * 0.52, letterSpacing: "-0.02em", fontWeight: 600 }}
      >
        Foresight
      </span>
    </span>
  );
}
