# Editorial Backlog — Name Vitals

Blog ideas built on the things **this dataset can do that no other baby-name site can**.
Generic baby-name blogs publish "100 cute girl names." We can publish the *actuarial
status of every name in America* — living population, median age, cause of death,
geographic origin, and the exact pop-culture event that created or killed it.

Every idea below is tagged with the **data lever** it pulls (the unique capability that
makes it defensible and hard to copy), a **format**, and a **bet** (viral swing /
evergreen SEO / data flex / franchise).

House voice (see `jessica-extinction-event.md`): lead with a stark number, short
declarative sentences, sociological read, link out to `/name/X/` pages, one inline
visual. Author = `NobodyNamed`.

---

## Validated by search demand — GSC, last 3 months

581 distinct queries; ~70 clicks / ~6k impressions; US-dominant; site in early ramp.
Intent is already clear (full analysis: `docs/seo/2026-06-09-gsc-blog-demand.md`):

| Intent cluster | Queries | Moat |
| --- | ---: | --- |
| Decade / year / generation | 136 | medium |
| Name popularity + rarity | ~145 | medium |
| "names like X" (discovery) | 70 | medium |
| **"how many people are named X"** | **25** | **high — unique** |
| **"how old is X" / age** | **12** | **high — unique** |
| extinct / endangered / rarest | 8 | high |

Two takeaways that reorder this backlog:

- **Lead with the unique-data intents.** "How many people are named X" + "how old is X"
  are the only questions no competitor answers well — we have `total_living_est` and
  `median_age`. The Karen flagship sits exactly here: lowest competition, highest share.
- **Decade demand is the biggest cluster (136) and we already rank page-1 — at 0% CTR.**
  `/names/1930s/` is #4 with 237 impressions and zero clicks. The blog's job is the
  clickable, link-worthy layer on top (plus title/meta fixes on those pages).

---

## ★ Flagship (drafted) — "How Many Karens Are Left?"

> The internet pictures Karen as a 45-year-old at a returns counter. The data says
> she's closer to 60 — and there are almost none under 25.

The single best demonstration of our secret weapon. We don't just chart a name; we run
it through an actuarial life table and report **how many living people carry it and how
old they are**. Karen peaked in **1965 at #3** (32,873 newborns, 1.8% of all girls).
The median living Karen is ~60. The meme attached itself to a name that was already
dying of old age. Full draft: `how-many-karens-are-left.md`.

- **Data lever:** living-population estimate + median age (`name_enrichment.total_living_est`, `median_age`, `life-table.csv`) + catalysts (`karen → 2020 internet meme`)
- **Format:** single-name deep dive
- **Bet:** viral swing + evergreen. The headline is a search magnet and a share magnet.

---

## Pillar 1 — Death, Extinction & Endangerment
*Our proven lane (the Jessica post). We are the morgue and the hospice for American names.*

1. **Names on Life Support** — The endangered list as a ward. Names with a million living
   bearers and ~zero births a year: who is the *last* generation to carry them, and what
   year does the name effectively flatline? Adopt-a-name energy.
   - *Lever:* `status='endangered'` + living-population. *Bet:* evergreen + franchise seed.

2. **The Class of 2009** — Names that flash-flooded and evaporated inside a decade
   (Renesmee/Twilight, later Khaleesi). The shortest-lived names in history.
   - *Lever:* wave topology = `Flash Flood`. *Bet:* viral.

3. **The Name That Pop Culture Killed** — When the *word* gets hijacked: Isis (2014),
   Alexa (Amazon, 2014), Katrina (2005), Karen (2020). A name can die overnight when a
   brand, a storm, or a meme claims it.
   - *Lever:* catalysts (`catalyst_type` = historical_event / internet) + sharp decline. *Bet:* viral.

4. **We Found the Last Ones** — Narrative nonfiction on a single near-extinct name's
   final cohort. Who are the ~50 babies a year still getting it?
   - *Lever:* endangered + spark trajectory. *Bet:* data flex / prestige piece.

## Pillar 2 — Cause & Effect (the catalysts table)
*We don't say "Arya got popular." We say what did it, when, and how hard.*

5. **The Madison Glitch** — A 1984 movie joke ("Madison's not a name") manufactured a
   top-2 girls' name out of nothing. The accidental-name phenomenon — names that exist
   only because of a single scene.
   - *Lever:* catalysts (movie) + before/after series. *Bet:* viral + evergreen. (Verified.)

6. **Winter Came for Khaleesi** — The Game of Thrones boom (Arya, Khaleesi, Daenerys),
   and the finale-regret dip. Did parents flinch after the last season?
   - *Lever:* catalysts (`arya`, `khaleesi` → 2011) + post-2019 trajectory. *Bet:* viral.

7. **Everything Disney Ever Launched** — Elsa, Ariel, Jasmine, Aurora, Moana, scored by
   how many real babies each film moved. A power ranking of the Disney naming machine.
   - *Lever:* catalysts (movie) + peak impact. *Bet:* evergreen SEO.

8. **Does TV Still Move Names?** — Broadcast era vs streaming era: a #1 show used to mint
   a name nationwide. In the algorithm age, does anything still hit everyone at once?
   - *Lever:* catalyst `impact_score` by decade. *Bet:* data flex / think-piece.

## Pillar 3 — The Age of a Name (the life table — nobody else has this)

9. **What Your Name Says About Your Age** — Median living age for every name. Gary reads
   ~70, Karen ~60, Aiden ~12. The most "age-coded" names in America. Built for a quiz.
   - *Lever:* `median_age`. *Bet:* viral + interactive (see Pillar 9).

10. **The Oldest and Youngest Names in America** — Highest vs lowest median living age.
    The names that are functionally a birth-decade in disguise.
    - *Lever:* `median_age` leaderboard. *Bet:* evergreen.

11. **Names With No Children** — Names whose entire living population is over 50. Still
    common at the DMV, extinct at the playground. A demographic ghost story.
    - *Lever:* living-population age distribution. *Bet:* viral.

## Pillar 4 — Maps & Migration (diaspora + regional anomalies)

12. **The Most [State] Name in America** — Location-quotient: the name that over-indexes
    hardest in each state vs the nation. One map, 50 punchlines. Endlessly shareable.
    - *Lever:* `name_regional_anomaly.location_quotient`. *Bet:* viral + evergreen.

13. **Where Names Are Born** — Every trend starts in a state and diffuses. The geography
    of a fad: coastal launch → national → heartland lag. Animated spread maps.
    - *Lever:* `name_diaspora` (origin_state, spread, diffusion_years). *Bet:* data flex.

14. **The Mason-Dixon Line of Names** — Names that stop dead at a regional border and the
    states that *never* adopt a national hit.
    - *Lever:* diaspora `never_adopted`. *Bet:* viral.

## Pillar 5 — Gender (the sex series)

15. **The One-Way Street** *(strong secondary flagship)* — Names cross from boys to girls
    and essentially never come back. Ashley, Leslie, Evelyn, Shannon, Aubrey. Why "girl"
    is a trapdoor a name can't climb back out of.
    - *Lever:* per-year sex split + the asymmetry. *Bet:* viral + think-piece. (Verified direction.)

16. **The Tipping Point** — The exact year each flipped name crossed 50/50 — and how fast
    the boys abandoned it once it did. The naming equivalent of neighborhood tipping.
    - *Lever:* sex-ratio crossover year. *Bet:* data flex.

## Pillar 6 — Dynasties & the End of the Meganame

17. **The Mary Century** *(strong)* — #1 nearly every year from the 1880s to 1961, then
    out of the top 10 by 1972, #135 today. The longest reign in American naming and the
    slowest collapse. The control case for everything.
    - *Lever:* 145-year series + share-of-births. *Bet:* evergreen + prestige. (Verified.)

18. **The Death of the Meganame** — No name will ever dominate like Mary, Linda, or
    Jennifer again. The top-10's share of all births has been shrinking for 70 years; the
    long tail is eating the chart. The single biggest structural story in the data.
    - *Lever:* top-10 share of `year_totals` over time. *Bet:* data flex / flagship-tier think-piece.

## Pillar 7 — Shapes & Sound

19. **The Five Shapes of Fame** — Flash Flood, Glacier, Steady Wave, Plateau, Steady
    Decline. Teach our topology with one perfect archetype name per shape. Establishes the
    house vocabulary; great internal-linking hub.
    - *Lever:* `wave_topology`. *Bet:* evergreen pillar page.

20. **The -aiden Singularity** — Aiden, Jayden, Brayden, Kayden, Zayden, Grayden. One
    rhyming sound that swallowed a generation of boys. Sound contagion as data.
    - *Lever:* suffix cohort aggregation. *Bet:* viral.

21. **Vowel Drift** — How the *sound* of American names changed over 145 years: the rise
    of names ending in -a and -n, the great schwa migration. Phonetics at population scale.
    - *Lever:* last-letter / phoneme analysis across all names. *Bet:* data flex.

## Pillar 8 — Decades & Generations (search-validated: the #1 query cluster)
*136 of 581 queries. We already rank page-1 for these and earn ~0% CTR — the blog is the
click layer, plus title/meta rescue on the existing `/year/*` and `/names/*s/` pages.*

- **Millennial Names, by the Numbers** — the names that *are* a millennial: peak years, the
  ones that became generational shorthand, where they are now. ("millennial names" recurs in
  live queries.) *Lever:* `/names/2000s/` + status. *Bet:* evergreen, biggest cluster.
- **The Sound of [Year]** — take one year (1953 already ranks #4 with 0 clicks) and tell it
  as a class roster: what a kindergarten sounded like, who's left now. *Bet:* evergreen + CTR rescue.
- **What Decade Is Your Name From?** — assign each name its definitive decade by peak share;
  serves the "names from the 1920s/2000s" demand and the age intent at once. *Bet:* viral + interactive.

## Pillar 9 — Recurring Franchises (own a beat, not a post)

22. **The Name Vitals Report (Annual)** — The week SSA drops new data each May: biggest
    risers, fallers, debuts, and deaths — auto-generated straight from the ingest pipeline.
    Own the one day a year this is national news. *Bet:* franchise + news cycle.

23. **Endangered Name of the Month** — Adopt-a-name. A short, sad, beautiful obituary for
    one name on the brink, monthly. *Bet:* franchise + social.

24. **Name on Trial** — Run any trending or celebrity-baby name through the full Name
    Vitals workup (status, age, trajectory, diaspora, catalyst). Reactive, fast, repeatable.
    *Bet:* franchise + newsjacking.

## Pillar 10 — Product-as-Content (interactive)

25. **Guess the Name's Age** — A quiz built on `median_age`. Score + shareable card.
26. **Is Your Name Dying?** — Personal lookup → status verdict → auto-generated share image
    (we already have OG image generation at `/api/og`). The growth-loop play.
27. **Name a Baby Like It's [Decade]** — Pick a year, get a plausible birth-certificate.

---

## Bold swings (high risk / high ceiling)

- **The Saddest Name in America** — pick a defensible metric (steepest single-peak-to-zero,
  or most living elderly + zero young) and crown it. People will argue. Good.
- **Names That Only Exist Because of a Typo** — Nevaeh ("heaven" backwards), and the
  spelling-variant explosion (Jaxon/Jaxson/Jaxen). Coinage as data.
- **The Hurricane Effect** — do named disasters kill names? Katrina after 2005, on the record.
- **Your Name Has a Half-Life** — frame every name as a radioactive isotope with a decay
  curve and compute its half-life. The most science-forward way to package decline.

## Sequencing (GSC-weighted — see `docs/seo/2026-06-09-gsc-blog-demand.md`)
1. **How Many Karens Are Left?** (drafted) — owns the unique-data intent ("how many people
   are named X" + age). Lowest competition, highest share.
2. **Millennial Names, by the Numbers** — rides the 136-query decade cluster; "millennial
   names" recurs in live queries.
3. **The Most [State] Name in America** — net-new map content; highest link/share ceiling.
4. **The One-Way Street** — counterintuitive, evergreen, gender hook.
5. **The Name Vitals Report** — stand up the franchise before the May SSA drop.

**Scale play:** turn the flagship into a **"How Many People Are Named ___?"** franchise —
25+ live queries already ask it by name (Sophia, Jacob, John, Michael, Madison…), and we are
the only site that can answer it from `total_living_est` + `median_age`.

**Free win (non-blog):** rewrite `<title>`/meta on `/names/1930s/` and `/year/195x/` —
page-1 rankings stranded at 0% CTR.
