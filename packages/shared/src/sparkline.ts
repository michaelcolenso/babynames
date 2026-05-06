// SVG sparkline used by SSR /name/:name and the in-page vitals view.
// Mirrors apps/web/public/assets/app.js buildSparkline so SSR output and
// client-side rerenders are byte-identical.

import type { Status } from "./schema";

export interface SparklineOpts {
  width?: number;
  height?: number;
  status?: Status;
}

// Status-keyed colors are emitted as inline CSS custom properties on the
// SVG root so the same CSS rules render any sparkline in the right palette
// without per-element class proliferation.
const STATUS_FILL: Record<Status, string> = {
  rising: "rgba(6, 125, 74, 0.12)",
  stable: "rgba(59, 91, 219, 0.10)",
  declining: "rgba(183, 121, 31, 0.12)",
  endangered: "rgba(180, 35, 24, 0.10)",
  extinct: "rgba(42, 42, 42, 0.10)",
};
const STATUS_LINE: Record<Status, string> = {
  rising: "var(--rising)",
  stable: "var(--stable)",
  declining: "var(--declining)",
  endangered: "var(--endangered)",
  extinct: "var(--extinct)",
};

export function buildSparkline(
  series: Record<number, number>,
  ym: number,
  yM: number,
  opts: SparklineOpts = {},
): string {
  const width = opts.width ?? 680;
  const height = opts.height ?? 280;
  const pad = { top: 22, right: 8, bottom: 30, left: 8 };

  const years: number[] = [];
  const vals: number[] = [];
  for (let y = ym; y <= yM; y++) {
    years.push(y);
    vals.push(series[y] ?? 0);
  }
  if (years.length < 2) return "";

  const maxV = Math.max(1, ...vals);
  const xStep = (width - pad.left - pad.right) / (years.length - 1);
  const yScale = (v: number) =>
    height - pad.bottom - (v / maxV) * (height - pad.top - pad.bottom);

  let linePath = "";
  for (let i = 0; i < years.length; i++) {
    const x = pad.left + i * xStep;
    const y = yScale(vals[i]!);
    linePath += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
  }
  const fillPath =
    linePath +
    `L${(pad.left + (years.length - 1) * xStep).toFixed(1)},${(height - pad.bottom).toFixed(1)}` +
    `L${pad.left.toFixed(1)},${(height - pad.bottom).toFixed(1)}Z`;

  let peakIdx = 0;
  for (let i = 0; i < vals.length; i++) if (vals[i]! > vals[peakIdx]!) peakIdx = i;
  const peakX = pad.left + peakIdx * xStep;
  const peakY = yScale(vals[peakIdx]!);
  const peakYear = years[peakIdx]!;

  let ticks = "";
  for (let y = Math.ceil(ym / 20) * 20; y <= yM; y += 20) {
    const i = y - ym;
    const x = pad.left + i * xStep;
    ticks += `<text x="${x.toFixed(1)}" y="${height - 6}" class="axis-text" text-anchor="middle">${y}</text>`;
  }

  // Peak-year label above the peak dot; latest-year label at the right edge,
  // baseline-aligned with the rightmost data point.
  const peakLabel = `<text x="${peakX.toFixed(1)}" y="${Math.max(12, peakY - 8).toFixed(1)}" class="peak-label" text-anchor="middle">${peakYear}</text>`;
  const latestX = pad.left + (years.length - 1) * xStep;
  const latestY = yScale(vals[vals.length - 1]!);
  const latestLabel = `<text x="${(latestX - 4).toFixed(1)}" y="${Math.max(12, latestY - 8).toFixed(1)}" class="latest-label" text-anchor="end">${yM}</text>`;

  const fill = opts.status ? STATUS_FILL[opts.status] : "rgba(59,91,219,0.12)";
  const line = opts.status ? STATUS_LINE[opts.status] : "var(--accent)";
  const styleAttr = ` style="--fill-color: ${fill}; --line-color: ${line};"`;

  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"${styleAttr}>
  <line class="axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"/>
  <path class="fill" d="${fillPath}"/>
  <path class="line" d="${linePath}"/>
  <circle class="peak" cx="${peakX.toFixed(1)}" cy="${peakY.toFixed(1)}" r="4"/>
  ${peakLabel}
  ${latestLabel}
  ${ticks}
</svg>`;
}
