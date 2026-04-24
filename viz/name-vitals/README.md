# Name Vitals

A personal-identity archaeology tool: type in any American name and get a "vital-signs" report — peak year, trajectory, all-time count, and a status verdict (rising / stable / declining / endangered / extinct).

Everything runs client-side against shards of public-domain Social Security data. No server, no tracking, no per-request build.

Lives under `viz/name-vitals/` so the repo's existing GitHub Pages workflow (which uploads `viz/`) picks it up unchanged. Deployed URL:
`https://michaelcolenso.github.io/babynames/viz/name-vitals/`.

## Coverage

Committed build uses Hadley Wickham's CC0 mirror of the SSA dataset (1880–2017). To pull forward through the current year, point the pipeline at `yob*.txt` files — the SSA's native format — from their `names.zip` release.

## Data sources (pipeline tries in order)

1. `viz/name-vitals/data_src/yob*.txt` — native SSA files. Preferred.
2. `$SSA_DATA_DIR/yob*.txt` — same, via env var (handy in CI).
3. `data/babynames.rda` at repo root — CC0 mirror, fallback.

## Rebuilding locally

```bash
# Grab the SSA zip (any normal machine works — Akamai blocks some server IPs
# but browsers/laptops/CI runners are fine):
curl -fsSL -o /tmp/names.zip https://www.ssa.gov/oact/babynames/names.zip
unzip -o /tmp/names.zip -d viz/name-vitals/data_src
find viz/name-vitals/data_src -type f ! -name 'yob*.txt' -delete

# Build (no Python deps needed when reading yob*.txt):
python3 viz/name-vitals/scripts/build_data.py    # shards + landing data
python3 viz/name-vitals/scripts/build_pages.py   # top-2000 SEO pages + sitemap

# Fallback path (using the committed .rda mirror) needs the rdata reader:
python3 -m venv .venv && .venv/bin/pip install rdata
.venv/bin/python viz/name-vitals/scripts/build_data.py
```

## Refreshing on every deploy

`scripts/deploy.yml.proposed` is a drop-in replacement for `.github/workflows/deploy.yml`. It downloads `names.zip` on the GitHub runner (not blocked from GH IPs), regenerates everything, then deploys. Needs a token with `workflow` scope to land — paste it over the existing workflow manually.

## Layout

```
viz/name-vitals/
├── index.html                  home + search
├── extinct.html                landing: peaked ≥500, absent ≥10 yrs
├── endangered.html             landing: down ≥90% from peak
├── rising.html                 landing: latest decade ≥5× previous
├── about.html                  methodology
├── name/<Name>/index.html      one SEO page per featured name (generated)
├── sitemap.xml, robots.txt     generated alongside name/
├── assets/
│   ├── app.js                  search, fetch, render, share card
│   ├── landing.js              landing-table renderer
│   └── style.css
├── data/
│   ├── index.json              top-5000 featured list + year totals
│   ├── meta.json               per-year totals + top-10 by sex
│   ├── names/<A-Z>.json        per-first-letter shards
│   └── landing/*.json          extinct / endangered / rising rows
└── scripts/
    ├── build_data.py           rda → JSON shards + landing sets
    └── build_pages.py          featured names → static HTML + sitemap
```
