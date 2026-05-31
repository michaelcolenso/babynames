# Handoff — State Signature Names work (branch `claude/blog-post-brainstorm-5vlaI`)

_Last updated: 2026-05-31_

## TL;DR
Everything is committed, pushed, and live. The blog rewrite is now DONE — applied
to D1 as the new "The Map Hidden in America's Birth Certificates" post (migration
`0014`). The ND/WV/KS mismatch was resolved by replacing "Names Time Forgot" with
"The Frontier Sound" (matches the modern-era map names). Only remaining open item:
the user must land `.github/workflows/ci.yml` (workflow-scope limit).

---

## What's DONE and live (PR #63 branch)

### Blog posts (live + published in D1)
- `your-states-signature-name` — "Every State Has a Name Only It Would Use"
  - Has the interactive map embedded: **desktop = US tile grid**, **mobile (≤700px)
    = 2-column silhouette cards** (real state SVG shapes, name, location quotient).
- `baby-name-trends-dont-start-on-the-coasts` — corrected per-capita diffusion story.

### Diffusion engine fix (live on D1)
- Redefined `name_diaspora` origin from **first-appearance** (population-biased,
  everything read "born in California") to **location-quotient breakout**:
  a state "breaks out" when its per-capita rate ≥ `LQ_TRIGGER` (1.5) × the name's
  national rate that year, gated by `NATIONAL_FLOOR` (20/100k) so sparse early
  years don't manufacture false origins.
  - Code: `apps/ingest-worker/src/diaspora-compute.ts`
  - Verified: Aiden→AK, Madison→UT, Brittany→UT, Mason→ND, Liam→VT, Harper→DC.
  - All 36,642 rows recomputed via `scripts/repopulate-diaspora.ts` and swapped live.
  - UI copy reworded for breakout semantics in `packages/shared/src/render-name.ts`.
- `npm test` runs typecheck (ingest+shared) + `scripts/verify-diaspora-percapita.ts`.

### The map — 4 bugs fixed via real-device testing (all live)
1. Names wrapped mid-word → switched mobile to silhouette cards.
2. Shapes collapsed to flat lines → Mercator-y was in radians; converted to degrees.
3. Cards flooded solid color → scoped `.sig-*` background rules to `.sig-tile` only.
4. Smallest text too small → bumped state label/LQ to 12.5px, name 18px, caption 13px.

### Key files
- `migrations/0013_signature_map.sql` — idempotent inject of the dual-layout map.
- `scripts/blog-assets/signature-map.html` — the map HTML (source of truth).
- `scripts/blog-assets/signature-data.json` — modern-era (2000+) signature per state.
- `scripts/blog-assets/state-paths.json` — normalized per-state SVG paths.
- `scripts/repopulate-diaspora.ts` — one-off D1 backfill (per-capita/breakout compute).

---

## ✅ RESOLVED — blog rewrite applied (migration 0014)
Applied live + recorded. New title "The Map Hidden in America's Birth Certificates",
restructured sections, map block preserved inline. The ND/WV/KS mismatch was solved
by replacing "Names Time Forgot" (which implied old names) with **"The Frontier
Sound"** — reframing the leftover/teal-bucket states as a *modern* surname/frontier
naming style (Bridger, Oakley, Tate, Brecken, Cashton, Sawyer, Colby + invented
-lee/-lyn names Brynlee/Oaklynn/Kinley). This matches what the map actually shows.
Source: `migrations/0014_signature_post_rewrite.sql`.

The original analysis that led here is kept below for reference.

## (HISTORICAL) the blog rewrite blocker — now resolved

The user rewrote the post body (new title: **"The Map Hidden in America's Birth
Certificates"**) with better structure: lede → The Football Belt → The Immigration
Map → Hawaii Breaks the Scale → Utah Is Its Own Naming Ecosystem → The Names Time
Forgot → What the Map Really Shows. **It's a clear improvement and approved in spirit.**
Full text is in the conversation history (user message before this handoff).

### BLOCKER: 3 name mismatches between rewrite prose and the live map
The rewrite's "The Names Time Forgot" section cites **all-time** signatures, but the
embedded map shows **modern-era (2000+)** signatures:

| State | Rewrite prose says | Map actually shows (modern) |
|-------|--------------------|-----------------------------|
| ND    | Marlys             | Brynlee                     |
| WV    | Drema              | Oaklynn                     |
| KS    | Twila              | Dayton                      |

All other cited names verified OK (Kinnick, Neyland, Crimson, Abdirahman, Benuel,
Avrohom, Yides, Estevan; Hawaii's Kainalu/Kainoa/Keanu/Shizue and Utah's
Dallin/Ammon/Brigham/Stockton/Brynlee all appear in their card lists).

**This is intentional tension, not a clear bug:** "Names Time Forgot" is *about* old
names that survived locally — Marlys/Drema/Twila are exactly that (all-time
signatures). But a reader looking at the ND card sees "Brynlee," not "Marlys."

### Decision needed from user (3 options)
1. **Keep prose as-is (Marlys/Drema/Twila), add a sentence** clarifying these are
   historical signatures vs. the map's modern names. (Cleanest narratively.)
2. **Swap prose to match the map** (Brynlee/Oaklynn/Dayton) — but those aren't
   "names time forgot," so the section's premise breaks. (Not recommended.)
3. **Add an all-time toggle/second set** to the map. (Most work.)

Recommended: option 1.

### Also reconcile when applying
- Post `description` field still says "Cajun French in Louisiana, Somali in
  Minnesota, stadium names in Iowa and Tennessee" — Louisiana/Angelle and
  Texas/Jesusa are dropped from the rewrite prose. Update description to match
  the new framing (lead with football + Hawaii + Utah).
- New title "The Map Hidden in America's Birth Certificates" — confirm whether to
  change the `title` field (affects URL slug? No — slug stays `your-states-signature-name`).

### How to apply (pattern used throughout this session)
D1 is reached via REST API (no wrangler D1 perms). Token + helper pattern:
```python
import json, urllib.request, uuid
TOKEN = "<CF_API_TOKEN with D1 edit>"  # user provided cfat_... earlier; expired-prone
ACCT  = "4e921a01da1f55b0ddb32bb38a5524ce"
DB    = "fc4741db-1f6d-457c-b4e4-675a4ea3ebc2"  # name-vitals
def q(sql, params=None):
    body = json.dumps({"sql": sql, "params": params or []}).encode()
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{ACCT}/d1/database/{DB}/query",
        data=body, headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))["result"][0]["results"]
```
- The map block lives between `<div class="sig-map-wrap">` and `<h2>...</h2>` in
  body_html. When replacing prose, **preserve the map block** (or re-inject from
  `scripts/blog-assets/signature-map.html`).
- Use a **parameterized UPDATE** (`body_html = ?`) to avoid quote-escaping pain.
- **Always bump `data_version`** after any post/diaspora write (edge cache is 7-day):
  `q("UPDATE meta SET value=? WHERE key='data_version'", [str(uuid.uuid4())])`
- If you add a migration, also write a matching `migrations/00NN_*.sql` and record it:
  `q("INSERT OR IGNORE INTO d1_migrations(name) VALUES('00NN_*.sql')")`

---

## OTHER OPEN ITEMS

### `.github/workflows/ci.yml` — needs the user's hand
The CI workflow file is ready in the working tree but **cannot be pushed by the
agent** — the git OAuth token and GitHub MCP both lack `workflow` scope (push
rejected: "refusing to allow an OAuth App to create or update workflow ...").
User must commit it from a desktop, OR provide a `workflow`-scoped token.

### Data note
- `name-vitals` D1 has state tables: `name_states` (6.6M rows, through 2025),
  `name_regional_anomalies` (signature/location-quotient engine, era-bucketed),
  `name_diaspora` (diffusion, now breakout-based).
- SSA.gov is firewalled from this environment (403); use D1 directly or a GitHub
  GeoJSON mirror (state shapes came from PublicaMundi us-states GeoJSON).

---

## SUGGESTED NEXT STEPS (in order)
1. Ask user to pick option 1/2/3 for the ND/WV/KS mismatch.
2. Apply the rewritten body to D1 (preserve map block, update title + description),
   bump `data_version`.
3. Mirror the change into a new migration `0014_*.sql` for source-of-truth parity
   (the post body is currently only edited live; migrations 0012/0013 are the record).
4. Commit + push.
5. (User) land `ci.yml`.
