"use client";

import { useEffect, useRef } from "react";

/**
 * Pixel thermal-heatmap — a grid of tiny squares whose "heat" scrolls and
 * evolves like a live pitch-pressure map, dispersing into the page at the top
 * and bottom edges. Cool (blue) → hot (red); `intensity` biases the whole field
 * hotter (used when a goal is brewing). Inspired by craft.wild.as's data storm.
 */

// Thermal ramp: navy → blue → lime → amber → red. Returns [r,g,b].
function thermal(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0.0, [10, 22, 52]],
    [0.28, [43, 92, 255]],
    [0.48, [166, 226, 46]],
    [0.66, [255, 188, 31]],
    [0.82, [255, 122, 26]],
    [1.0, [255, 46, 63]],
  ];
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [x0, c0] = stops[i - 1];
      const [x1, c1] = stops[i];
      const f = (x - x0) / (x1 - x0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

export function PixelHeatmap({
  height = 220,
  cell = 13,
  intensity = 0.45,
  className,
}: {
  height?: number;
  cell?: number;
  intensity?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intensityRef = useRef(intensity);

  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0, h = 0, cols = 0, rows = 0, dpr = 1;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      cols = Math.ceil(w / cell) + 1;
      rows = Math.ceil(h / cell) + 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // layered value-noise heat field, biased hot toward a slowly drifting centre
    const gap = 1.5;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const cx = 0.5 + 0.16 * Math.sin(t * 0.18);
      const bias = intensityRef.current;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const nx = i / cols, ny = j / rows;
          let n =
            Math.sin(i * 0.38 + t) +
            Math.sin(j * 0.52 - t * 0.8) +
            Math.sin((i + j) * 0.3 + t * 1.25) +
            Math.sin((i - j) * 0.24 - t * 0.6);
          n = (n + 4) / 8; // → 0..1
          // concentrate heat toward the drifting centre column
          const dist = Math.abs(nx - cx);
          const centre = 1 - Math.min(1, dist * 1.9);
          // vertical envelope: fade to nothing at top & bottom (dispersion)
          const env = Math.sin(ny * Math.PI);
          let heat = n * 0.55 + centre * 0.45;
          heat = heat * (0.55 + bias) * (0.35 + env * 0.9);
          const alpha = Math.min(1, env * 1.15) * (0.35 + heat * 0.75);
          if (alpha < 0.04) continue;
          const [r, g, b] = thermal(heat);
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
          ctx.fillRect(i * cell, j * cell, cell - gap, cell - gap);
        }
      }
    };

    if (reduce) {
      draw(1.2);
    } else {
      let t = 0;
      let last = 0;
      const loop = (now: number) => {
        // ~30fps for a calm, engineered cadence
        if (now - last > 33) { t += 0.02; draw(t); last = now; }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [height, cell]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ display: "block", width: "100%", height }}
    />
  );
}
