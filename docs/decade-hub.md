# Decade hub operations guide

Operational reference for the 1980s decade hub (`/names/1980s/` plus its
`methodology/`, `classroom/`, and `spelling-families/` child routes). The hub
renders from a single precomputed `DecadeProfile` JSON payload stored in the
`decade_hub` D1 table (migration `migrations/0021_decade_hub.sql`), one row per
decade, read by primary key at request time. Methodology version:
`decade-hub/v1.0.0`.

## Regenerate the data

The build is offline and deterministic: same source data + same
`DECADE_HUB_METHODOLOGY_VERSION` ⇒ byte-identical JSON except `generatedAt`.

```bash
npm run build-decade-hub
```

This runs `tsx scripts/build-decade-hub.ts`, which:

1. Resolves the source data (`--source` flag; the parser only accepts the
   equals form, e.g. `--source=shards`):
   - `--source=auto` (default) — prefers the live `name-vitals` D1 database,
     then an SSA zip (a local zip in `data/raw/ssa-national/` if one is
     present, otherwise the ssa.gov download), then the tracked shards in
     `viz/name-vitals/data/`.
   - `--source=d1` — force the live D1 database. Reads `CLOUDFLARE_ACCOUNT_ID`
     and `CLOUDFLARE_API_TOKEN` and queries the D1 HTTP API (read-only). This
     is the newest vintage available to the project, since the ingest worker
     refreshes D1 from SSA every year.
   - `--source=shards` — force the tracked shards. These are frozen at the
     2017 vintage; use them only offline, and never for a shipped payload —
     lifetime-based measures such as the ownership score are wrong when a
     name's recorded history is truncated eight years early.
   - `--source=zip` — force download of `https://www.ssa.gov/oact/babynames/names.zip`
     (same mechanism as `scripts/ingest-ssa.ts`).
   - `--zip=./names.zip` — use a local SSA zip file instead of downloading.
2. Asserts the sanity anchors (1984 total births 3.49M±3% — SSA ≥5-occurrence
   sums; 3.66M is registered births —; Michael (M) 1984 count in the 60k–70k
   range; Jennifer (F) 1980s decade total > 350k).
3. Writes two gitignored artifacts:
   - `data/dist/decade-hub-1980.json` — the full payload as pretty JSON
     (inspection, tests, fixtures).
   - `data/dist/decade-hub-1980.sql` — a single `INSERT OR REPLACE INTO
     decade_hub` statement.
4. Prints a stdout summary (top-10 ownership per sex, alpha, counts).

The current payload was built from `ssa-national-2025` (records through 2025)
via `--source=d1`; `sourceVersion` and `generatedAt` are recorded inside the
payload and rendered on the methodology page.

Rebuilding on a newer vintage changes every figure on the hub, including the
hand-written thesis copy in `packages/shared/src/content/decade-theses.ts`.
Re-check that copy against the new `data/dist/decade-hub-1980.json` before
seeding, and re-trim `scripts/fixtures/decade-hub-1980.real.fixture.json` (top
100 ownership rows per sex, everything else intact) so the payload contract
test runs against the shipped artifact.

## Apply the migration and seed D1 (repo owner only)

Migrations are applied manually by the repo owner — never by CI or
contributors. `apps/web/wrangler.toml` must exist locally with the real
`database_id` (it is gitignored; see README setup steps). Then:

```bash
wrangler d1 migrations apply name-vitals --remote --config apps/web/wrangler.toml
npx tsx scripts/seed-decade-hub.ts           # dry run: prints current vs artifact
npx tsx scripts/seed-decade-hub.ts --apply   # writes and verifies the row
```

The first command applies `0021_decade_hub.sql`; the second seeds the `1980s`
row from `data/dist/decade-hub-1980.json`.

**Do not seed with `wrangler d1 execute --file=data/dist/decade-hub-1980.sql`.**
That file inlines the ~840 KB payload as one SQL string literal and D1 rejects
the statement with `SQLITE_TOOBIG` — the limit is on the SQL text, not on the
stored value. `scripts/seed-decade-hub.ts` binds the payload as a query
parameter instead, which stores identical bytes. The `.sql` artifact is kept
for inspection and diffing.

Until the row exists, the hub route feature-detects the missing row and falls
back to the legacy decade page, so deploy order is safe in that direction. The
reverse is not: the scorecard is payload-driven while the thesis prose is
compiled into the Pages bundle, so seeding a new vintage *before* deploying the
matching copy leaves the live page quoting two different sets of numbers. Ship
the code first, or accept a window of mismatch.

## Run the tests

```bash
npm run test:decade-hub
```

Runs five suites (39 tests): methodology/ownership (`decade-hub.test.ts`),
classroom (`decade-hub-classroom.test.ts`), spelling families
(`decade-hub-families.test.ts`), routes with a fake D1
(`decade-hub-routes.test.ts`), and the payload contract of the real artifact
(`decade-hub-payload.test.ts`, pure JSON — no D1 needed).

`test:decade-hub` is wired into the root `npm test` script after the editorial
suites. The `verify-*` scripts require a live D1 and are not part of local
checks.

## Revise spelling families

Families are curated only through `data/manual/spelling-families.csv` (one row
per variant):

```
family_id,label,canonical,variant,review_status,rationale
```

Rules:

- Only rows with `review_status=approved` are used.
- A family ships only if it has ≥2 approved variants, each variant has ≥1,000
  births in the decade, and the combined total is ≥20,000.
- No variant may appear in two approved families (the tests enforce this).
- Every variant must exist in the source data (also enforced by tests).

After editing the CSV, rebuild:

```bash
npm run build-decade-hub
npm run test:decade-hub
```

Then update any copy that quotes family figures (thesis, video briefs) against
the new `data/dist/decade-hub-1980.json`.

## Change alpha (ownership shrinkage)

Alpha is the `DECADE_HUB_ALPHA` constant in
`packages/shared/src/decade-hub-compute.ts` (currently `2500`).

1. Run the sensitivity sweep first — it does not depend on the constant:

   ```bash
   npm run sensitivity:decade-hub
   ```

   This writes `data/dist/decade-hub-sensitivity.md`: top-25 per
   α ∈ {500, 1000, 2500, 5000, 10000}, rank churn vs α=500, and the
   smallest-α low-volume intrusion count (names with <5,000 decade births in
   the top-25).
2. Inspect the report. Choose the smallest α with zero low-volume intrusions
   in the top-25 that preserves intuitive ordering of substantial names
   (expected landing zone 1000–2500; if all candidates allow intrusions, use
   10000 and flag it).
3. Edit `DECADE_HUB_ALPHA`, rebuild (`npm run build-decade-hub`), re-run
   `npm run test:decade-hub`, and record the choice + rationale in the
   methodology payload section and the PR note.

## Add another decade

Checklist (every 1980s-specific guard to generalize):

- [ ] Compute: `DECADE_START`/`DECADE_END` constants in
      `packages/shared/src/decade-hub-compute.ts` and the decade literals in
      `scripts/build-decade-hub.ts` (sanity anchors are 1980s-specific; write
      new anchors for the target decade).
- [ ] Types: `DecadeProfile.decade/startYear/endYear` are literal-typed to
      1980/1980/1989 in `packages/shared/src/decade-hub-types.ts`.
- [ ] Route guards: the `decade !== "1980s"` 404 guards in
      `apps/web/functions/names/[decade]/methodology/index.ts`,
      `.../classroom/index.ts`, `.../spelling-families/index.ts`, and the
      1980s branch in `apps/web/functions/names/[decade]/index.ts`.
- [ ] Thesis: add an entry to `DECADE_THESES` in
      `packages/shared/src/content/decade-theses.ts` (hand-written, real
      figures, no causal claims).
- [ ] Sitemap: `decadeHubUrls()` in `apps/web/functions/sitemap.xml.ts`.
- [ ] Spelling families: add verified families for the decade to
      `data/manual/spelling-families.csv` (same threshold rules).
- [ ] Fixtures/tests: new fixture + payload test copy for the decade.
- [ ] Seed: owner runs the build SQL for the new decade row.

## Analytics event contract

All events use `content_id = decade-hub:1980s` on the hub and
`decade-hub:1980s/<child>` on child routes, `content_type = decade-hub`.
Every event is a no-op if `window.nvTrack` is absent (JS enhancement only).
Fired from `apps/web/public/assets/decade-hub.js` unless noted.

| Event name | When it fires | source_placement | target |
|---|---|---|---|
| `decade_hub_view` | Every hub pageview (explicit; the automatic `landing` event also fires via `data-content-*` attributes) | route path | — |
| `decade_hub_scroll_depth` | Scroll depth thresholds crossed (fire-once per threshold per session) | `25` / `50` / `75` / `100` | — |
| `decade_hub_engaged_time` | `pagehide`, via `sendBeacon` | bucket: `lt15s` / `30s` / `60s` / `120s` / `300s` / `300s+` | — |
| `decade_hub_internal_click` | Delegated click on hub internal anchors | control/section id | destination content id (e.g. `name:heather`, `year:1984`) |
| `decade_hub_share` | Share control activated | control id | — |
| `decade_hub_copy_link` | Copy-link control activated | control id | — |
| `ownership_tab_changed` | Ownership ranking tab switched | tab id | — |
| `ownership_sort_changed` | Ownership table column sort changed | column id | — |
| `ownership_name_clicked` | Name inside the ownership module clicked | — (not sent) | `name:<lower>` |
| `ownership_methodology_clicked` | Methodology link from ownership section clicked | section id | — |
| `classroom_loaded` | Roster enters viewport (IntersectionObserver, 25% threshold, once) | route path | — |
| `classroom_name_clicked` | Roster name clicked | — (not sent) | `name:<lower>` |
| `classroom_duplicate_clicked` | Roster name with seats > 1 clicked | — (not sent) | `name:<lower>` |
| `classroom_completed` | Roster bottom sentinel visible (once) | route path | — |
| `spelling_family_expanded` | Family card/details expanded | family id | — |
| `spelling_family_chart_interacted` | Hover/focus interaction with a family chart | family id | — |
| `spelling_variant_clicked` | Variant name clicked | — (not sent) | `name:<lower>` |
| `spelling_methodology_clicked` | Methodology link from spelling section clicked | section id | — |

Fire-once dedupe (the `once()` guards above) is per page view: the keys live
in a page-load-scoped map, so reloading the page re-arms every once-event.

Event names are a closed vocabulary, validated in both
`packages/shared/src/analytics.ts` (`AnalyticsEventName`) and
`apps/web/functions/api/analytics/event.ts` (`EVENT_NAMES`); both lists must be
extended together. Events map onto the existing `analytics_events` D1 schema —
no schema change.

## Deployment notes

1. Open the PR; CI deploys Pages via `wrangler pages deploy public` on merge.
2. The stylesheet cache-buster was bumped (`/assets/style.css?v=18` in
   `packages/shared/src/render-shell.ts`) so the appended `dh-*` CSS block is
   picked up immediately.
3. The repo owner applies migration `0021_decade_hub.sql` and seeds the `1980s`
   row with the two wrangler commands above.
4. Zero-downtime behavior: until the D1 row exists, the hub route
   feature-detects the missing row and falls back to the legacy decade page
   unchanged; child routes 404 as before. Seeding the row (or removing it)
   flips the hub on (or off) with no deploy.
