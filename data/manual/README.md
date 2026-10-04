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

### Where the current values come from

The file holds the table that production's stored rows imply, not a table
copied from a source. Until 2026-10-03 it held a different, more optimistic
table (commit `5d6019e`, 2026-05-25), and production's rows were not built from
it. Checked read-only against production D1, with the real builder on
production's own `name_years` counts (`scripts/fixtures/enrichment-d1.real.fixture.json`):

| name | production: living / median (25th–75th) | previous CSV: living / median (25th–75th) | previous vs production |
|---|---|---|---|
| Gladys (F) | 45,132 / 74 (58–86) | 55,070 / 77 (63–88) | +22.0% |
| Karen (F) | 774,778 / 65 (58–72) | 845,523 / 66 (58–73) | +9.1% |
| Linda (F) | 1,010,533 / 72 (65–77) | 1,155,171 / 73 (66–78) | +14.3% |
| Mary (F) | 1,642,012 / 70 (59–78) | 1,894,543 / 71 (61–80) | +15.4% |
| Jennifer (F) | 1,389,607 / 47 (41–53) | 1,415,086 / 47 (41–54) | +1.8% |
| Michael (M) | 3,665,667 / 51 (37–64) | 3,800,053 / 52 (37–65) | +3.7% |
| John (M) | 2,820,437 / 60 (42–71) | 3,019,595 / 61 (44–73) | +7.1% |
| Brandon (M) | 748,301 / 33 (26–41) | 749,858 / 33 (26–41) | +0.2% |

The builder's algorithm is right; the input table differed. With the builder's
interpolation, living totals are linear in the survival values at the 23
checkpoint ages, so the table behind production's rows can be recovered by least
squares. The values here were fitted that way to 174 common names, then checked
on 71 more that were never fitted. With the real builder and this file, all 245
names reproduce production's median age and both quartiles exactly, and their
living totals to within 4 people (at most 3.6×10⁻⁴ relative; 2.8×10⁻⁵ on the
fitted names). That is why a reseed from this file leaves the figures visitors
see, and the published post "How Many Karens Are Left?" (about 775,000 living,
median 65), where they are. The previous values are in git history.

| survival to age | 65 | 75 | 85 | 95 |
|---|---|---|---|---|
| women, now | 0.846 | 0.682 | 0.409 | 0.143 |
| women, before | 0.905 | 0.803 | 0.572 | 0.198 |
| men, now | 0.809 | 0.624 | 0.346 | 0.107 |
| men, before | 0.857 | 0.716 | 0.453 | 0.133 |

Implied life expectancy at birth (area under the interpolated curve) is about
79.5 (F) and 77.0 (M) now, against 84.0 and 80.0 before.

### What is not established

- Where production's table came from. It may have been edited locally before
  seeding and never committed.
- Whether it, or the previous table, matches SSA's published life tables. SSA's
  site refused automated access when this was checked.
- The survival values at ages 1 to 35 are weakly determined by the data (changes
  below rounding), so treat them as a fit, not a measurement. Older ages are
  tightly determined.
- A reseed is not guaranteed to be identical to production, only to match it
  within a few people for living totals. `npm run seed-enrichment` deletes and
  re-inserts every enrichment table, including regional anomalies and catalysts,
  which were not compared here.

### Changing it

If you have the original CSV, or prefer a table sourced from SSA, replace the
file. `npm run test:enrichment` will then fail
`builder reproduces production's stored enrichment profiles for pinned names`,
which is the warning that the site's figures will change on the next seed.
Update the fixture and that test deliberately in the same change.

### A third table

`packages/shared/src/generate-narrative.ts` carries its own sex-averaged table
(labelled "SSA 2020 period life table", survival at 65 of 0.752). It is used
only when a name has no enrichment profile, so names under 100 recorded births
get a harsher estimate than names above it. Run on the same series it gives
Karen about 665,700 living, against 774,778 in production.
