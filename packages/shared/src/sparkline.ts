// SVG sparkline used by SSR /name/:name and the in-page vitals view.
// Mirrors viz/name-vitals/assets/app.js buildSparkline so SSR output and
// client-side rerenders are byte-identical.

export interface SparklineOpts {
  width?: number;
  height?: number;
}

export function buildSparkline(
  series: Record<number, number>,
  ym: number,
  yM: number,
  opts: SparklineOpts = {},
): string {
  const width = opts.width ?? 680;
  const height = opts.height ?? 170;
  const pad = { top: 14, right: 8, bottom: 22, left: 8 };

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

  let ticks = "";
  for (let y = Math.ceil(ym / 20) * 20; y <= yM; y += 20) {
    const i = y - ym;
    const x = pad.left + i * xStep;
    ticks += `<text x="${x.toFixed(1)}" y="${height - 6}" class="axis-text" text-anchor="middle">${y}</text>`;
  }

  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <line class="axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"/>
  <path class="fill" d="${fillPath}"/>
  <path class="line" d="${linePath}"/>
  <circle class="peak" cx="${peakX.toFixed(1)}" cy="${peakY.toFixed(1)}" r="4"/>
  ${ticks}
</svg>`;
}
