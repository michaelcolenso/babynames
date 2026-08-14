# Decade hub batch review

## Task 9 — all-decade curation inputs

**Review date:** 2026-08-14
**Source:** live Cloudflare D1 `name-vitals` (`fc4741db-1f6d-457c-b4e4-675a4ea3ebc2`)
**Source version:** `ssa-national-2025`
**Methodology version:** `decade-hub/v1.0.0`
**D1 data version:** `fff212bc-bf3c-4097-aeca-4e95e2f296f5`
**Coverage:** 1880–2025
**Production writes:** none; all D1 calls were `SELECT` queries and reported `rows_written: 0`

### Evidence generation

The build-all command loaded the live D1 source once and produced 15 validation artifacts outside git. It read 117,816 name/sex records and preserved the documented integrity bracket. The `year_totals` rollup differed from the canonical `name_years` sum on 38 year/sex pairs by 281 births in total, within the existing tolerance; profile computation used `name_years`.

A separate read-only D1 batch queried decade totals, midpoint-year totals, and female/male decade champions. Every generated profile matched the independent totals and champion counts. A second build-all pass exercised the reviewed family CSVs against the same live source.

### Mechanical family criteria

Every approved family was checked by the real profile builder against all of these rules:

- at least two reviewed variants;
- at least 1,000 births per variant in the actual decade coverage;
- at least 20,000 combined births;
- one sex selected deterministically from the canonical spelling;
- no variant duplicated across families within a decade;
- deterministic output ordering.

The 1880s intentionally retain a header-only no-family file because no conservative reviewed grouping cleared the requirements. The 2020s use only actual 2020–2025 coverage and remain `isComplete: false`.

### Batch A — early decades

**Decades:** 1880s, 1890s, 1900s, 1910s, 1930s (1920s pilot unchanged)
**Independent reviewer:** `deleg_d15d151f/task-0`
**Decision:** approved; explicit no-family state for the 1880s
**Editorial checks:** totals/champions, concentration, ownership contrast, midpoint classroom, strongest family or no-family state, SSA limitations, and non-causal language all verified against the evidence packet.

The reviewer found Catherine/Katherine forms, Sarah/Sara, Elizabeth/Elisabeth, Marian/Marion, and Eleanor/Elinor semantically defensible where they clear the numeric thresholds. Below-threshold Cathryn forms were not included.

### Batch B — mid-century decades

**Decades:** 1940s, 1950s, 1960s, 1970s (1980s pilot unchanged)
**Independent reviewer:** `deleg_d15d151f/task-1`
**Decision:** approved after one mandatory semantic correction
**Correction:** Geoffrey was excluded from every Jeffrey family. Only the direct Jeffrey/Jeffery pair remains. The corrected pair still clears all numeric thresholds in every selected decade.

Steven/Stephen, Philip/Phillip, Theresa/Teresa, Brian/Bryan, Rebecca/Rebekah, Michelle/Michele, Eric/Erik, and Sean/Shawn/Shaun were retained where selected and threshold-eligible. The parent replaced the weaker proposed Alan/Allen/Allan 1940s grouping with the clearer Sarah/Sara family before the curated live build.

### Batch C/D — late decades

**Decades:** 1990s, 2000s, 2010s, 2020s
**Independent reviewer:** `deleg_d15d151f/task-2`
**Decision:** approved
**Partial coverage:** every 2020s statement and family total is explicitly scoped to 2020–2025; no projection to 2026–2029 is made.

The reviewer accepted the selected late-decade spelling families as defensible editorial groupings while requiring plain-language caveats that family groupings do not erase personal identity or become SSA categories.

### Parent acceptance

**Parent reviewer:** current Task 9 session
**Status:** curation inputs accepted pending final repository-wide verification and final adversarial review.

Parent checks completed:

- all 15 profile totals, coverage windows, completeness flags, source/methodology versions, and champions matched independent D1 evidence;
- all emitted family rows passed thresholds and duplicate checks;
- all 15 definitions now have `ssa-national-2025` provenance and at least two independently queried sanity anchors;
- all 15 thesis headings are unique and every thesis has at least six paragraphs;
- an explicit assertion table checks totals, champion counts, diversity values, classroom years, and strongest family/no-family claims for all 13 newly curated decades;
- 1920s and 1980s pilot thesis text and seeded rollout state remain unchanged;
- no generated profile artifact, local D1 state, credential, or temporary review file is part of the delivery.
