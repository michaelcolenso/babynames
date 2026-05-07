// SVG sparkline used by SSR /name/:name and the in-page vitals view.

import type { Status } from "./schema";

export interface SparklineOpts {
  width?: number;
  height?: number;
  status?: Status;
}

export function buildSparkline(
  series: Record<number, number>,
  ym: number,
  yM: number,
  opts: SparklineOpts = {},
): string {
  const width = opts.width ?? 680;
  const height = opts.height ?? 280;
  const pad = { top: 30, right: 46, bottom: 26, left: 10 };
  const status = opts.status ?? "stable";
  const statusColor: Record<Status, string> = {
    rising: "var(--rising)",
    stable: "var(--stable)",
    declining: "var(--declining)",
    endangered: "var(--endangered)",
    extinct: "var(--extinct)",
  };
  const fillColor: Record<Status, string> = {
    rising: "rgba(20, 122, 67, 0.14)",
    stable: "rgba(75, 85, 99, 0.13)",
    declining: "rgba(162, 104, 34, 0.15)",
    endangered: "rgba(180, 35, 24, 0.13)",
    extinct: "rgba(38, 38, 38, 0.12)",
  };

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
  const latestIdx = years.length - 1;
  const latestX = pad.left + latestIdx * xStep;
  const latestY = yScale(vals[latestIdx]!);

  let ticks = "";
  for (let y = Math.ceil(ym / 20) * 20; y <= yM; y += 20) {
    const i = y - ym;
    const x = pad.left + i * xStep;
    ticks += `<text x="${x.toFixed(1)}" y="${height - 6}" class="axis-text" text-anchor="middle">${y}</text>`;
  }

  const peakLabelY = Math.max(12, peakY - 8);
  const latestLabelY = Math.max(12, latestY - 8);

  return `<svg class="sparkline sparkline-${status}" style="--line-color:${statusColor[status]};--fill-color:${fillColor[status]}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <line class="axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"/>
  <path class="fill" d="${fillPath}"/>
  <path class="line" d="${linePath}"/>
  <circle class="peak" cx="${peakX.toFixed(1)}" cy="${peakY.toFixed(1)}" r="4"/>
  <text x="${peakX.toFixed(1)}" y="${peakLabelY.toFixed(1)}" class="point-label" text-anchor="middle">peak ${years[peakIdx]}</text>
  <text x="${latestX.toFixed(1)}" y="${latestLabelY.toFixed(1)}" class="point-label" text-anchor="end">${yM}</text>
  ${ticks}
</svg>`;
}
