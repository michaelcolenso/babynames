#!/usr/bin/env tsx
// Alpha sensitivity sweep for the ownership shrinkage prior (SPEC §3).
// Runs the ownership computation over alpha in {500, 1000, 2500, 5000, 10000},
// tabulates the pooled top-25 per alpha, rank churn vs alpha=500, and the
// count of low-volume intrusions (birthsInDecade < 5,000 in the top-25).
// Output: data/dist/decade-hub-sensitivity.md (+ stdout).
//
// Selection rule (SPEC §3): pick the SMALLEST alpha with zero low-volume
// intrusions in the top-25 that preserves intuitive ordering of substantial
// names. If all candidates allow intrusions, pick 10000 and flag it.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ELIGIBILITY_MIN_BIRTHS,
  computeOwnership,
  computeOwnershipViews,
  computeTop1000Years,
  summarizeRecord,
} from "../packages/shared/src/decade-hub-compute";
import { loadShardSource } from "./build-decade-hub";

const REPO = path.resolve(import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = path.join(REPO, "data/dist/decade-hub-sensitivity.md");
const ALPHAS = [500, 1000, 2500, 5000, 10000];

async function main() {
  const { source, sourceVersion } = await loadShardSource();
  console.error(`loaded ${source.records.length} records (${sourceVersion})`);
  const stats = source.records.map((r) => summarizeRecord(r, source.maxYear));
  const top1000 = computeTop1000Years(source.records);

  interface SweepRow {
    alpha: number;
    priorF: number;
    priorM: number;
    top25: { rank: number; name: string; sex: string; score: number; births: number }[];
    churnVs500: number; // names in top-25 not present in the alpha=500 top-25
    intrusions: number; // top-25 names with birthsInDecade < ELIGIBILITY_MIN_BIRTHS
  }

  const rows: SweepRow[] = [];
  let baseline: Set<string> | null = null;
  for (const alpha of ALPHAS) {
    const ownership = computeOwnership(stats, top1000, alpha);
    const views = computeOwnershipViews(ownership.female, ownership.male);
    const top25 = views.mostOwned.map((r, i) => ({
      rank: i + 1,
      name: r.name,
      sex: r.sex,
      score: r.ownershipScore,
      births: r.birthsInDecade,
    }));
    const ids = new Set(top25.map((t) => `${t.sex}|${t.name.toLowerCase()}`));
    if (baseline === null) baseline = ids;
    let churn = 0;
    for (const id of ids) if (!baseline.has(id)) churn++;
    rows.push({
      alpha,
      priorF: ownership.priorDecadeShareFemale,
      priorM: ownership.priorDecadeShareMale,
      top25,
      churnVs500: churn,
      intrusions: top25.filter((t) => t.births < ELIGIBILITY_MIN_BIRTHS).length,
    });
  }

  // selection: smallest alpha with zero intrusions (expected landing zone 1000–2500)
  const clean = rows.filter((r) => r.intrusions === 0);
  const chosen = clean.length ? clean[0]!.alpha : 10000;
  const flagged = clean.length === 0;

  const md: string[] = [];
  md.push(`# Decade hub ownership — alpha sensitivity (1980s)`);
  md.push(``);
  md.push(`Source: ${sourceVersion} (tracked shards). Generated: ${new Date().toISOString()}.`);
  md.push(`Pooled "Most Owned" top-25 per alpha; churn = names in the top-25 not present at alpha=500;`);
  md.push(`intrusions = top-25 names with birthsInDecade < ${ELIGIBILITY_MIN_BIRTHS.toLocaleString("en-US")}.`);
  md.push(``);
  md.push(`| alpha | prior (F) | prior (M) | churn vs 500 | low-volume intrusions |`);
  md.push(`|------:|----------:|----------:|-------------:|----------------------:|`);
  for (const r of rows) {
    md.push(`| ${r.alpha} | ${r.priorF} | ${r.priorM} | ${r.churnVs500} | ${r.intrusions} |`);
  }
  md.push(``);
  for (const r of rows) {
    md.push(`## alpha = ${r.alpha}`);
    md.push(``);
    md.push(`| # | name | sex | score | 1980s births |`);
    md.push(`|--:|------|-----|------:|-------------:|`);
    for (const t of r.top25) {
      const flag = t.births < ELIGIBILITY_MIN_BIRTHS ? " ⚠ low-volume" : "";
      md.push(`| ${t.rank} | ${t.name}${flag} | ${t.sex} | ${t.score.toFixed(4)} | ${t.births.toLocaleString("en-US")} |`);
    }
    md.push(``);
  }
  md.push(`## Selection`);
  md.push(``);
  if (flagged) {
    md.push(`FLAGGED: every candidate alpha allows low-volume intrusions in the top-25; defaulting to alpha=10000 per SPEC §3.`);
  } else {
    md.push(`Chosen alpha = **${chosen}** — the smallest candidate with zero low-volume intrusions in the pooled top-25.`);
  }
  md.push(``);

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, md.join("\n"));
  console.log(md.slice(0, 12).join("\n"));
  console.log(`\nchosen alpha = ${chosen}${flagged ? " (FLAGGED fallback)" : ""}`);
  console.log(`wrote ${path.relative(process.cwd(), OUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
