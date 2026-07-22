export interface MiniSparklineOptions {
  name: string;
  minYear: number;
  maxYear: number;
}

const WIDTH = 120;
const HEIGHT = 40;
const LEFT = 2;
const RIGHT = 118;
const TOP = 2;
const BASELINE = 28;

export function buildMiniSparkline(values: number[], options: MiniSparklineOptions): string {
  if (values.length < 2) return "";
  if (!Number.isFinite(options.minYear) || !Number.isFinite(options.maxYear)) return "";

  for (let index = 0; index < values.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(values, index)) return "";

    const value = values[index];
    if (value === undefined) return "";
    if (!Number.isFinite(value) || value < 0) return "";
  }

  const maxValue = Math.max(...values);
  if (maxValue === 0) return "";

  const xStep = (RIGHT - LEFT) / (values.length - 1);
  const chartHeight = BASELINE - TOP;
  const points = values.map((value, index) => {
    const x = LEFT + index * xStep;
    const y = BASELINE - (value / maxValue) * chartHeight;
    return `${index === 0 ? "M" : "L"}${formatNumber(x)},${formatNumber(y)}`;
  });
  const linePath = points.join("");
  const fillPath = `${linePath}L${RIGHT},${BASELINE}L${LEFT},${BASELINE}Z`;
  const label = escapeAttribute(
    `Normalized popularity trend for ${options.name}, ${options.minYear}-${options.maxYear}`,
  );

  return `<svg class="mini-sparkline" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">
  <path class="mini-sparkline-fill" aria-hidden="true" d="${fillPath}"/>
  <path class="mini-sparkline-line" d="${linePath}"/>
  <text class="mini-sparkline-year" x="${LEFT}" y="39" text-anchor="start">${options.minYear}</text>
  <text class="mini-sparkline-year" x="${RIGHT}" y="39" text-anchor="end">${options.maxYear}</text>
</svg>`;
}

function formatNumber(value: number): string {
  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
