# Google Search Console — Setup & Scripts

Three CLI tools for pulling live GSC data for **nobodynamed.com**.

| Script | Purpose | Command |
|---|---|---|
| `gsc:quickwins` | Striking-distance keyword analysis (snapshot + compare) | `npm run gsc:quickwins` |
| `gsc:diff` | Diff two historical quickwins CSVs to surface movers | `npm run gsc:diff` |
| `gsc:inspect` | URL-level index coverage / inspection | `npm run gsc:inspect -- <url>` |

All scripts use a **service-account JWT** (no browser login). Setup is one-time.

---

## 1. Create / pick a Google Cloud project

- Go to <https://console.cloud.google.com/projectcreate>
- Name it anything (e.g. `nobodynamed-gsc`). Create it and make sure it's selected.

## 2. Enable the Search Console API

- Visit <https://console.cloud.google.com/apis/library/searchconsole.googleapis.com>
- Click **Enable** (confirm the right project is selected up top).

## 3. Create a service account + JSON key

- Go to <https://console.cloud.google.com/iam-admin/serviceaccounts>
- **Create service account** → give it a name (e.g. `gsc-reader`) → **Create and continue**
  → skip the optional roles → **Done**.
- Click the new service account → **Keys** tab → **Add key → Create new key → JSON** →
  **Create**. A `.json` file downloads.
- Move it to this exact path (it's git-ignored):

  ```
  scripts/.gsc-service-account.json
  ```

- Note the service account's email — it looks like
  `gsc-reader@your-project.iam.gserviceaccount.com`.

## 4. Grant the service account access to the GSC property

- Open <https://search.google.com/search-console> for **nobodynamed.com**.
- **Settings** (left nav) → **Users and permissions** → **Add user**.
- Paste the service-account email from step 3.
- Permission: **Full** (or **Restricted** — read access is enough). **Add**.

> If nobodynamed.com is a **Domain property**, leave `GSC_SITE` as the default
> `sc-domain:nobodynamed.com`. If it's a **URL-prefix property**, run with
> `GSC_SITE="https://nobodynamed.com/"`.

## 5. Run the scripts

### Quickwins — striking-distance keywords

```bash
# Default: last 90 days, positions 4–20, worldwide
npm run gsc:quickwins

# Compare with previous period
npm run gsc:quickwins -- --compare

# Filter to a path, specific country, longer window
npm run gsc:quickwins -- --path=/blog/ --country=usa --days=180

# JSON output + no branded queries
npm run gsc:quickwins -- --json --no-brand
```

Output:
- Console table (top 30 keywords + top 10 pages)
- Dated CSVs in `scripts/gsc-data/quickwins-YYYY-MM-DD.csv`
- Dated page CSV in `scripts/gsc-data/quickwins-pages-YYYY-MM-DD.csv`
- `quickwins-latest.csv` (convenience copy)
- Optional JSON with `--json`

### Diff — compare two runs

```bash
# Auto-pick the two most recent dated CSVs
npm run gsc:diff

# Compare specific files
npm run gsc:diff -- scripts/gsc-data/quickwins-2026-05-01.csv scripts/gsc-data/quickwins-2026-06-01.csv
```

Shows: gainers, losers, new entries, dropped keywords, impression movers.

### Inspect — URL-level index status

```bash
# Single URL
npm run gsc:inspect -- https://nobodynamed.com/name/Emma/

# Multiple URLs + CSV output
npm run gsc:inspect -- --csv=scripts/gsc-inspect.csv \
  https://nobodynamed.com/name/Emma/ \
  https://nobodynamed.com/blog/the-kehlani-effect/
```

---

### Env vars (all optional)

| Var | Default | Purpose |
|---|---|---|
| `GSC_SA_KEY` | `scripts/.gsc-service-account.json` | Path to service-account JSON |
| `GSC_SITE` | `sc-domain:nobodynamed.com` | Property URL or `sc-domain:` prefix |
| `GSC_DAYS` | `90` | Lookback window in days |
| `GSC_COUNTRY` | — | ISO-3 country filter, e.g. `usa` |
| `GSC_OUTPUT_DIR` | `scripts/gsc-data` | Where dated CSVs are written |

---

### Troubleshooting

- **`Zero rows returned`** — the service account isn't added to the property (step 4),
  or `GSC_SITE` is wrong (domain property needs the `sc-domain:` prefix).
- **`Token exchange failed`** — the key file is malformed, or the Search Console API
  isn't enabled on the same project the key belongs to (steps 2–3).
- **`403`** — permission not granted yet, or propagation delay; wait a minute and retry.
