# Name Vitals

A personal-identity archaeology tool: type in any American name and get a "vital-signs" report — peak year, trajectory, all-time count, and a status verdict (rising / stable / declining / endangered / extinct).

Everything runs client-side against shards of public-domain Social Security data. No server, no tracking, no per-request build.

Lives under `viz/name-vitals/` so the repo's existing GitHub Pages workflow (which uploads `viz/`) picks it up unchanged. Deployed URL:
`https://michaelcolenso.github.io/babynames/viz/name-vitals/`.

## Coverage

Uses Hadley Wickham's CC0 mirror of the SSA dataset (1880–2017, every first name given to at least five American babies in a year). The SSA's direct `names.zip` download is blocked from most server environments; drop a fresher `data/babynames.rda` (or adapt `scripts/build_data.py` to read `yob*.txt`) to extend through the current year.

## Rebuilding

```
# one-time:
python3 -m venv .venv && .venv/bin/pip install rdata

# pipeline (from repo root):
.venv/bin/python viz/name-vitals/scripts/build_data.py   # shards + landing data
.venv/bin/python viz/name-vitals/scripts/build_pages.py  # top-2000 SEO pages + sitemap
```

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
