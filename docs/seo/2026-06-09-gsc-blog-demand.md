# GSC → Blog Demand Analysis — 2026-06-09

Source: Google Search Console export, **nobodynamed.com**, Search type = Web, last 3 months.
Real impressions only begin ~2026-05-18, so this is effectively ~3 weeks of a site in
early-ramp. Volumes are tiny but the **intent patterns are already unambiguous** and should
drive editorial.

## Site state

- ~70 clicks / ~6,000 impressions in the window; avg position ~15.7 (US).
- Impressions ramped from single digits to ~700/day (late May → June 4). Indexing is working.
- **US-dominant**: 58 of ~70 clicks, 4,027 impressions. Long tail: India, Canada, UK, NL, SE.
- **Mobile** earns more and ranks better (pos 8.7, 2.1% CTR) than **desktop** (pos 19.3, 0.42%).
- Homepage is the only strong converter: 25 clicks, 43% CTR, pos 8.8.

## Query intent — distribution of 581 distinct queries

| Intent cluster | Queries | Maps to | Moat |
| --- | ---: | --- | --- |
| Decade / year / generation | **136** | `/year/*`, `/names/*s/` | Medium |
| Name popularity + rarity (combined) | **~145** | name pages, `status`, metrics | Medium |
| "names like / similar to X" | **70** | NameDiscoveryModule / related | Medium |
| "how many people are named X" | **25** | **living-population estimate** | **High — unique** |
| "how old is X" / age | **12** | **median age** | **High — unique** |
| extinct / endangered / comeback / rarest | **8** | landing pages, Jessica lane | High |

Representative live queries:
- *Living population:* how many people are named sophia / jacob / john / michael / emma /
  william / madison / muhammad / noah — even adolf, lucifer, goku.
- *Age:* how old is nikita / benjamin / kya; how popular is my name the year i was born.
- *Decade:* popular names 1920s/1930s/1940s, most popular baby names 1964/1988/1994,
  2009 names, early 2000s names, **millennial names** (recurs several times).
- *Rarity:* is emma/amelia/olivia/noah a rare name; what is the rarest name in the us.
- *Discovery:* names like odysseus / claude / colin / imogen / lyra (70 variants).

## The big finding: we rank, we don't get clicked

High-impression pages are stranded at 0% CTR despite **page-1** rankings:

| Page | Impressions | Position | Clicks |
| --- | ---: | ---: | ---: |
| /names/1930s/ | 237 | 4.2 | **0** |
| /year/1953/ | 170 | 4.2 | **0** |
| /year/1951/ | 36 | 2.5 | **0** |
| /year/1950/ | 31 | 1.1 | **0** |
| /name/Mary/ | 30 | 7.9 | **0** |
| /year/1955/ | 24 | 1.0 | **0** |

The programmatic decade/year pages are doing the ranking work but the SERP snippet isn't
earning the click. This is the single biggest near-term lever.

## Implications for the blog

1. **Own the unique-data questions first (highest moat, built to travel).** "How many people
   are named X" (25) + "how old is X" (12) are the only intents no competitor answers well —
   we have `total_living_est` and `median_age`. Lead with the **"How Many ___ Are Left?"**
   franchise (flagship: Karen). Low competition, high shareability, direct internal links to
   name pages.

2. **Mine the decade cluster (136) for clicks, not just rankings.** Narrative decade posts
   with clickable, specific titles ("The Sound of 1953", "Millennial Names, by the Numbers")
   that internal-link to the `/year/*` and `/names/*s/` pages. Separately, rewrite the
   `<title>`/meta description on the top-ranked-but-0-CTR decade pages — that's free traffic.

3. **Productize "names like X" (70).** It already ranks better than average (pos 7–40). A
   recommendation content type / discovery hub feeds a real, repeated query shape.

4. **Rarity/popularity (~145) is table stakes** — name pages already serve it. Blog value-add
   is the *superlatives*: "The Rarest Names in America" (direct query), rarity leaderboards.

5. **Format for mobile.** Most clicks are mobile; keep posts skimmable, fast, single-visual.

## Suggested first five (GSC-weighted)

1. **How Many Karens Are Left?** — unique-data flagship (drafted). Owns the living-pop intent.
2. **Millennial Names, by the Numbers** — rides the 136-query decade cluster + "millennial" recurrence.
3. **The Most [State] Name in America** — net-new map content; high link/share ceiling.
4. **The One-Way Street** (boy→girl flips) — evergreen, counterintuitive, gender hook.
5. **The Name Vitals Report** — annual SSA-drop franchise; stand it up before next May.

Plus a non-blog quick win: fix titles/meta on `/names/1930s/`, `/year/195x/` (0% CTR at pos ~4).
