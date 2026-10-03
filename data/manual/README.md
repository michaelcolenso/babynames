# data/manual

Hand-maintained inputs to the offline builders in `scripts/`. This note covers
`life-table.csv`, the input behind every "living people" and "median age"
figure in the enrichment dossier (`name_enrichment_profiles`).

## life-table.csv

`sex,age,survival_probability`: the cumulative probability of surviving from
birth to `age`, one row per checkpoint (ages 0, 1, 5, 10, … 100, 110, 119 for
each sex). `scripts/build-enrichment.ts` linearly interpolates between
checkpoints (`survivalAt`), applies the result to every SSA birth-year cohort of
a name aged to `ANALYSIS_YEAR` (2026), and stores:

- `total_living_est` = Σ births × survival
- `median_age`, `age_range_low`, `age_range_high` = the 50th, 25th and 75th
  percentile ages of those survivors

The file records no source. It has one commit (`5d6019e`, 2026-05-25).

### Open question: production was not built from this file

Checked 2026-10-03, read-only. The values stored in production D1 do not follow
from this CSV, although the builder's algorithm is not the problem.

**Committed table vs. production, same series.** The real builder, run with this
CSV on production's own `name_years` counts (`scripts/fixtures/enrichment-d1.real.fixture.json`):

| name | production: living / median (25th–75th) | this CSV: living / median (25th–75th) | living vs production |
|---|---|---|---|
| Gladys (F) | 45,132 / 74 (58–86) | 55,070 / 77 (63–88) | +22.0% |
| Karen (F) | 774,778 / 65 (58–72) | 845,523 / 66 (58–73) | +9.1% |
| Linda (F) | 1,010,533 / 72 (65–77) | 1,155,171 / 73 (66–78) | +14.3% |
| Mary (F) | 1,642,012 / 70 (59–78) | 1,894,543 / 71 (61–80) | +15.4% |
| Jennifer (F) | 1,389,607 / 47 (41–53) | 1,415,086 / 47 (41–54) | +1.8% |
| Michael (M) | 3,665,667 / 51 (37–64) | 3,800,053 / 52 (37–65) | +3.7% |
| John (M) | 2,820,437 / 60 (42–71) | 3,019,595 / 61 (44–73) | +7.1% |
| Brandon (M) | 748,301 / 33 (26–41) | 749,858 / 33 (26–41) | +0.2% |

The gap grows with age, which points at survival at older ages.

**The algorithm is right; the input table differs.** With the builder's
interpolation, living totals are linear in the survival values at the 23
checkpoint ages, so the table behind production's rows can be recovered by least
squares. A table fitted that way to 174 common names matches their stored living
totals to within 2×10⁻⁵ (relative), and reproduces the median age and both
quartiles for all 71 further names it was never fitted to, with their living
totals within 4 people. This CSV matches none of those 71 exactly and differs in
median or quartile for 26.
In production's table survival at 65 is about 0.846 for women and 0.809 for men,
against 0.905 and 0.857 here; implied life expectancy at birth (area under the
interpolated curve) is about 79.5 (F) and 77.0 (M) against 84.0 and 80.0 here.

**Why it matters.** Visitors see production's numbers, and so does the published
post "How Many Karens Are Left?" (about 775,000 living, median 65). A reseed
from this CSV would change them: Karen to about 845,500 and 66, Gladys to
about 55,000 and 77.

**Not established.** Where production's table came from (the CSV may have been
edited locally before seeding and never committed), and which table, if either,
matches SSA's published life tables. SSA's site refused automated access when
this was checked, so neither table was compared with SSA's.

Until this is settled:

- `scripts/enrichment.test.ts` keeps one test skipped
  (`builder reproduces production's stored enrichment profiles for pinned names`).
  It passes once this CSV reproduces production. Remove its `skip` then.
- Do not run `npm run seed-enrichment` expecting to leave production unchanged.
  It deletes and re-inserts every enrichment table, computed from SSA's files and
  the CSVs in this folder.

### A third table

`packages/shared/src/generate-narrative.ts` carries its own sex-averaged table
(labelled "SSA 2020 period life table", survival at 65 of 0.752). It is used
only when a name has no enrichment profile, so names under 100 recorded births
get a harsher estimate than names above it. Run on the same series it gives
Karen about 665,700 living, against 774,778 in production.
