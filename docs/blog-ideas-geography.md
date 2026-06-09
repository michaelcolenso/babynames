# Blog ideas — geography & the diaspora data

Pitches surfaced from the diaspora/state-data work. Every one is grounded in
data we already hold (`name_states`, `name_regional_anomalies`, `name_diaspora`)
and most reuse visuals we can already render (the statebin tile grid). Ordered
by punch.

---

## 1. Three Names Run America
**Hook:** You'd expect 50 different #1 baby names. You get about five. In 2023,
**Liam, Oliver, and Noah are the most common name in 43 of 51 jurisdictions.**
The US naming map is far less diverse than it feels from inside it.

**Data (live, 2023):** Liam — 20 states, Oliver — 13, Noah — 10. Outliers tell
their own story: **Theodore** (ME, MN, WI), **William** (AL), **John** (MS) —
Deep-South / Upper-Midwest traditionalism — and three states where a *girls'*
name was #1 overall: **Isla** (HI), **Charlotte** (NH), **Evelyn** (WY).

**And it answers the obvious question:** the most common name in **Texas is Liam**
(2,771) — the question that kicked off this whole investigation.

**Visual:** `viz/most-common-name-2023.svg` (already generated). A statebin
choropleth, each state colored by its #1 name.

**Effort:** Low — visual done; ~600 words.

---

## 2. Where the Old Names Still Live
**Hook:** A classic name doesn't die everywhere at once. It retreats to a
heartland. Mary is vanishing nationally — but she's still **~5.7× over-represented
in Mississippi** and 5.6× in Alabama. Map the last strongholds of America's
fading names.

**Data:** `name_regional_anomalies` (location quotients per state/era). This is
the exact data behind the new legacy-name "Where it lives now" map on `/name`.

**Visual:** Per-name strongholds heatmap (reuses the diaspora tile grid), or a
small-multiples grid of a dozen vanishing classics and their Deep-South / rural
retention.

**Effort:** Low–medium — data + render path already exist.

---

## 3. Ground Zero: Where Modern Names Are Born
**Hook:** Every name that emerged after 1910 has a birthplace and a spread
pattern. Brittany, Madison, Dakota, Kehlani — each broke out somewhere first,
then diffused. Watch them spread across the map, year by year.

**Data:** the repaired `name_diaspora` (per-capita breakout origins, post-1910
names only). Pairs with the existing animated diffusion time-lapse in `app.js`.

**Visual:** the diaspora diffusion map (origin → early → late), a few names
side by side.

**Effort:** Medium — depends on the diaspora recompute landing (PR #77).

---

## 4. How a State With 67 Births Broke Our Map
**Hook:** A data-storytelling / methods post. We tried to find where "Mary"
came from and the answer came back: *Nevada, 1910.* It was wrong — Nevada
recorded **67 total births that year**, 10 of them Marys, and a naive ratio
turned that fluke into a fake origin. The fix — location quotients, significance
guards, and ignoring the pre-1910 data cliff — is the post.

**Hook line:** "Most popular" and "most *local*" are not the same question, and
conflating them is how California ends up 'inventing' every name.

**Visual:** before/after — raw-count origin vs per-capita origin for a handful
of names; the 67-births callout.

**Effort:** Medium — narrative-heavy, but the story writes itself and it shows
methodological rigor.

---

## 5. The Sameness Map vs. The Signature Map
**Hook:** Two maps, one story. The *most common* name map (#1) is a wash of three
names — sameness. But the *most disproportionately local* name per state (highest
location quotient) is all regional identity. Show them side by side: what America
shares vs. what makes each state distinct.

**Data:** `name_states` for "most common"; `name_regional_anomalies` for
"signature." Extends the existing `your-states-signature-name` post.

**Visual:** paired tile maps.

**Effort:** Medium.

---

## 6. Boys Converge, Girls Diverge
**Hook:** Why is the most-common-name map almost entirely boys' names, with only
three girl exceptions (HI, NH, WY)? Because boys' names are far more
*concentrated* than girls' names — parents experiment more with daughters. Chart
the geographic and overall concentration of boy vs. girl names over a century.

**Data:** `name_states` + `year_totals`; a concentration metric (HHI / top-N
share) by sex over time.

**Visual:** two diverging concentration curves, 1910→2023.

**Effort:** Medium–high — needs a new aggregate, but it's a genuinely novel claim.

---

### Notes
- #1 and #2 are the fastest wins (visual + data in hand).
- #4 doubles as an "about our methodology" trust piece.
- All tile-grid visuals reuse `packages/shared/src/us-states-map.ts` coordinates.
