# Name-data analysis: reusable SQL idioms

A reference for anyone (human or agent) exploring the Name Vitals dataset for
anthropological, sociological, or historical insight. It captures the query
patterns that recur across almost every interesting question, plus the data
traps that are easy to fall into.

**Database:** `name-vitals` — Cloudflare D1 (`database_id` in `apps/web/wrangler.toml`;
currently `fc4741db-1f6d-457c-b4e4-675a4ea3ebc2`). US SSA baby-name data, 1880–present.
Query it read-only (SELECT) — via the Cloudflare MCP `d1_database_query`, or
`wrangler d1 execute name-vitals --remote`. Never run writes/DDL against production
without explicit sign-off.

## Schema cheat-sheet

| Table | Grain | Key columns |
| --- | --- | --- |
| `names` | one row per (name, sex) | `id, name, name_lower, sex('M'/'F'), first_year, last_year, peak_year, peak_count, total_count, latest_count, decline_pct, status, spark_blob` |
| `name_years` | (name_id, year) | `name_id, year, count` — **sparse**: a row exists only when `count ≥ 5` (~1.9M rows) |
| `year_totals` | (year, sex) | `year, sex, total` — the denominator for shares |
| `name_enrichment_profiles` | (name_lower, sex) | `total_living_est, median_age, age_range_low, age_range_high, wave_topology, latest_pct, analysis_year` |
| `name_catalysts` | (name_lower, sex, year) | `trigger_year, catalyst_title, catalyst_type, impact_score, description, source_url` — pop-culture events, pre-tagged |
| regional-anomaly table | (name, state, era) | `state, location_quotient, era_start_year` (confirm exact name/columns in `packages/shared/src/d1-queries.ts`) |

Classifier metrics (peak, decline, status) are precomputed on `names` — API reads never recompute them.

## The six idioms

### 1. Share-of-total
Normalize a raw count by the year/sex total to measure *cultural penetration* —
immune to changing birth volumes, so it compares cleanly across eras.

```sql
SELECT ny.year, ny.count * 100.0 / yt.total AS pct
FROM name_years ny
JOIN names n        ON n.id = ny.name_id
JOIN year_totals yt ON yt.year = ny.year AND yt.sex = n.sex
WHERE n.name_lower = ?1 AND n.sex = ?2;
```
Answers: peak *share* vs peak *count*, dominance, conformity. Prefer this over raw
counts for any cross-era comparison.

### 2. Rank-window
Rank names within each (year, sex) for top-N, #1-over-time, and rank trajectories.

```sql
WITH r AS (
  SELECT ny.year, n.sex, n.name, ny.count,
         ROW_NUMBER() OVER (PARTITION BY ny.year, n.sex ORDER BY ny.count DESC) AS rk
  FROM name_years ny JOIN names n ON n.id = ny.name_id
  WHERE ny.year IN (1880, 1950, 2000, 2024)
)
SELECT r.year, r.sex,
       SUM(CASE WHEN r.rk <= 10 THEN r.count ELSE 0 END) * 100.0 / yt.total AS top10_pct
FROM r JOIN year_totals yt ON yt.year = r.year AND yt.sex = r.sex
GROUP BY r.year, r.sex;
```
Answers: top-N per year, a name's rank in a given year, conformity (Σ top-N share).
Use `RANK()` if ties should share a rank. Restrict the years — ranking across all
years scans hundreds of thousands of rows.

### 3. Trajectory-around-a-year (cliff / spike detection)
Pull a name's series in a window around an event and look for the break.

```sql
SELECT ny.year, ny.count
FROM name_years ny JOIN names n ON n.id = ny.name_id
WHERE n.name_lower = ?1 AND n.sex = ?2
  AND ny.year BETWEEN ?3 - 8 AND ?3 + 8
ORDER BY ny.year;
```
To auto-score, compare `avg(count after)` to `avg(count before)`. Answers: names
made/killed by events (Alexa → Amazon Echo; Isis → ISIS; Katrina → the hurricane;
Adolph → WWII). Cross-check against `name_catalysts`, which pre-tags many triggers.

### 4. Cohort / age math
Treat a name as a living, aging population. Use the precomputed profile, or apply a
survival curve to each birth-year count.

```sql
SELECT name_lower, sex, total_living_est, median_age
FROM name_enrichment_profiles
WHERE total_living_est >= 100000
ORDER BY median_age DESC;   -- DESC = "grandparent" names, ASC = "playground" names
```
Answers: grandparent vs playground names, "most-dead" names (high median age +
endangered), generational signatures. Profiles treat `analysis_year` as "now"; the
on-the-fly life-table method lives in `packages/shared/src/generate-narrative.ts`.

### 5. Group-by-morphology
Aggregate by a *string feature* of the name rather than the name itself.

```sql
SELECT ny.year, UPPER(SUBSTR(n.name, -1)) AS last_letter, SUM(ny.count) AS births
FROM name_years ny JOIN names n ON n.id = ny.name_id
GROUP BY ny.year, last_letter;
```
Variants: `LENGTH(name)` (birth-weighted average length over time), `SUBSTR(name,-3)`
(suffix waves), `SUBSTR(name,1,1)` (initials), or a phonetic key (spelling-variant
proliferation: Aiden/Aidan/Ayden/Jayden). Answers: sound fashion, name-length trends,
spelling fragmentation. Gotcha: the full `name_years × names` join is ~1.9M rows —
multi-second; fine for one-offs, cache for anything user-facing.

### 6. Location quotient (geographic concentration)
Over/under-representation of a name in a place vs the national baseline:
`LQ = (name's share in state) / (name's share nationally)`. `LQ ≥ 1.5` ≈ regionally
concentrated. Already precomputed in the regional-anomaly table.

```sql
SELECT name, state, location_quotient
FROM <regional_anomaly_table>
WHERE location_quotient >= 1.5
ORDER BY location_quotient DESC;
```
Answers: state-signature names, regional culture, diffusion origins. Gotcha: SSA
state-level data begins in 1910.

## House rules (the traps)

- **Reporting floor = 5.** A (name, year) row exists only if at least five babies got
  the name. **Absence ≠ zero**, and the smallest nonzero count is 5.
- **Grain:** one row per (name, sex) in `names`; join `name_years` on `name_id`; match
  on `name_lower`, display `name`.
- **`first_year = last_year`** is a cheap, exact test for "appeared in exactly one year."
- **Data artifacts to filter:**
  - 1989 truncations — `AND NOT (first_year = 1989 AND LENGTH(name) = 8)` removes
    phantom 8-char names (`Christop`, `Alexandr`, `Jacqueli`…) that are real names with
    their tails cut off. 53 of them, ~2,210 births, all in 1989.
  - Clerical abbreviations (`Wm, Chas, Geo, Robt, Thos, Jos, Eliz, Edw, Danl`) pollute
    the main `names` table. Most are multi-year, so a one-year filter won't catch them —
    screen explicitly when they'd distort a result.
- **Recency:** the latest data year is ~2025. For "vanished" / "one-and-done" analyses,
  exclude the last 1–2 years (`first_year <= 2023`) — they haven't had a chance to recur.
- **D1 specifics:** window functions work; **chunk large `IN` lists** (D1's bound-variable
  ceiling is below SQLite's 999 — see `chunkedIn` in `packages/shared/src/d1-chunk.ts`);
  very large result sets exceed the MCP token cap and **auto-save to a file** — compact
  with `group_concat(line, char(10))` or paginate.
- **Free leverage:** `name_catalysts` (events), `name_enrichment_profiles` (age/living),
  the regional-anomaly table (geography), and the classifier metrics already on `names`
  mean most analysis needs no recomputation.

## Worked examples (real results, for calibration)

- **Death of the shared name:** boys' top-10 share fell 44.2% (1880) → 8.0% (2024);
  girls 24.6% → 7.1%. The #1 name went from ~9% of births to ~1%. *(idioms 1 + 2)*
- **Names the news killed:** Alexa 6,053 (2015) → 349 (2024) after the Echo; Isis 401
  (2014) → 53 (2016) after ISIS; Katrina 1,328 (2005) → 505 (2007). *(idiom 3)*
- **Names are generations:** a typical Betty is 79; a typical Oliver is 8. *(idiom 4)*
- **The shrinking name:** girls' average length peaked at 6.24 letters (2000) and fell
  back to 5.90 (2024). *(idiom 5)*
