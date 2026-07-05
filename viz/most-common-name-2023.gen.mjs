// Generates a statebin tile-grid SVG of the most common baby name per state
// (2023, both sexes), from the live name_states data surfaced in this thread.
// Run: node viz/most-common-name-2023.gen.mjs > viz/most-common-name-2023.svg
import { writeFileSync } from "node:fs";

// [row, col] statebin layout (mirrors packages/shared/src/us-states-map.ts).
const GRID = {
  AK:[0,0], ME:[0,10],
  VT:[1,9], NH:[1,10],
  WA:[2,0], ID:[2,1], MT:[2,2], ND:[2,3], MN:[2,4], WI:[2,5], MI:[2,7], NY:[2,8], MA:[2,9], RI:[2,10],
  OR:[3,0], NV:[3,1], WY:[3,2], SD:[3,3], IA:[3,4], IL:[3,5], IN:[3,6], OH:[3,7], PA:[3,8], NJ:[3,9], CT:[3,10],
  CA:[4,0], UT:[4,1], CO:[4,2], NE:[4,3], MO:[4,4], KY:[4,5], WV:[4,6], VA:[4,7], MD:[4,8], DE:[4,9],
  AZ:[5,1], NM:[5,2], KS:[5,3], AR:[5,4], TN:[5,5], NC:[5,6], SC:[5,7], DC:[5,8],
  OK:[6,3], LA:[6,4], MS:[6,5], AL:[6,6], GA:[6,7],
  HI:[7,0], TX:[7,2], FL:[7,8],
};

// Most common name per state, 2023 (live name_states query). NJ was a Liam/Noah tie.
const TOP = {
  AK:"Oliver", AL:"William", AR:"Liam", AZ:"Liam", CA:"Noah", CO:"Liam", CT:"Noah", DC:"Liam", DE:"Noah",
  FL:"Liam", GA:"Noah", HI:"Isla", IA:"Oliver", ID:"Oliver", IL:"Noah", IN:"Liam", KS:"Liam", KY:"Liam",
  LA:"Liam", MA:"Noah", MD:"Liam", ME:"Theodore", MI:"Noah", MN:"Theodore", MO:"Oliver", MS:"John",
  MT:"Oliver", NC:"Liam", ND:"Oliver", NE:"Oliver", NH:"Charlotte", NJ:"Liam", NM:"Liam", NV:"Liam",
  NY:"Liam", OH:"Oliver", OK:"Liam", OR:"Oliver", PA:"Noah", RI:"Noah", SC:"Noah", SD:"Oliver", TN:"Liam",
  TX:"Liam", UT:"Liam", VA:"Liam", VT:"Oliver", WA:"Oliver", WI:"Theodore", WV:"Oliver", WY:"Evelyn",
};

const COLOR = {
  Liam:"#2563eb", Oliver:"#16a34a", Noah:"#f59e0b", Theodore:"#7c3aed",
  William:"#dc2626", John:"#0891b2", Isla:"#db2777", Charlotte:"#e11d48", Evelyn:"#9333ea",
};

const CELL = 72, PAD = 24, TITLE_H = 86;
const cols = 11, rows = 8;
const gridW = cols * CELL, gridH = rows * CELL;
const W = gridW + PAD * 2;

// Legend: ordered by number of states, then name.
const counts = {};
for (const s of Object.values(TOP)) counts[s] = (counts[s] ?? 0) + 1;
const legend = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
const legendRows = Math.ceil(legend.length / 3);
const LEGEND_H = 40 + legendRows * 30;
const H = TITLE_H + gridH + PAD + LEGEND_H;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
let tiles = "";
for (const [st, [r, c]] of Object.entries(GRID)) {
  const x = PAD + c * CELL, y = TITLE_H + r * CELL;
  const name = TOP[st];
  const fill = COLOR[name] ?? "#94a3b8";
  tiles += `<g>
    <rect x="${x + 3}" y="${y + 3}" width="${CELL - 6}" height="${CELL - 6}" rx="9" fill="${fill}"/>
    <text x="${x + CELL / 2}" y="${y + 28}" text-anchor="middle" fill="#fff" font-weight="700" font-size="17">${st}</text>
    <text x="${x + CELL / 2}" y="${y + 48}" text-anchor="middle" fill="#fff" font-size="11" opacity="0.95">${esc(name)}</text>
  </g>\n`;
}

let legendSvg = "";
legend.forEach((name, i) => {
  const col = i % 3, row = Math.floor(i / 3);
  const x = PAD + col * (gridW / 3), y = TITLE_H + gridH + PAD + 26 + row * 30;
  legendSvg += `<g>
    <rect x="${x}" y="${y - 13}" width="16" height="16" rx="4" fill="${COLOR[name]}"/>
    <text x="${x + 24}" y="${y}" font-size="14" fill="#0f172a">${esc(name)} — ${counts[name]} state${counts[name] > 1 ? "s" : ""}</text>
  </g>\n`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif, system-ui, sans-serif">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <text x="${PAD}" y="40" font-size="26" font-weight="800" fill="#0f172a">America's most common baby name, by state (2023)</text>
  <text x="${PAD}" y="66" font-size="14" fill="#475569">Three names — Liam, Oliver, Noah — top 43 of 51 jurisdictions. The map is far less diverse than it looks.</text>
  ${tiles}
  ${legendSvg}
</svg>`;

writeFileSync(new URL("./most-common-name-2023.svg", import.meta.url), svg);
console.log("wrote viz/most-common-name-2023.svg");
