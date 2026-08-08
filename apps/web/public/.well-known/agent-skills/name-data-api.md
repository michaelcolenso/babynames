# NobodyNamed Name Data API

Retrieve US baby name popularity data from Social Security Administration records spanning 1880 to 2025.

## Base URL

`https://nobodynamed.com`

## Authentication

None. All endpoints are public.

## Endpoints

### Search names
`GET /api/search?q={prefix}`

Returns up to 10 autocomplete suggestions for names beginning with `prefix`.

**Response** (JSON array):
```json
[{"name": "Michael", "sex": "M"}, {"name": "Michelle", "sex": "F"}]
```

---

### Full name timeseries
`GET /api/name/{name}`

Returns complete yearly birth count data for both sexes (M and F) plus trend classification and metrics.

**Parameters:** `name` is case-insensitive.

**Response** (JSON):
```json
{
  "name": "Jennifer",
  "rows": [
    {
      "sex": "F",
      "status": "declining",
      "peak_year": 1974,
      "peak_count": 48655,
      "spark_blob": "<base64>",
      "years": [[1955, 18], [1956, 42], ...]
    }
  ]
}
```

**Status values:** `rising` | `stable` | `declining` | `endangered` | `extinct`

---

### Site metadata
`GET /api/meta`

Returns top-10 names per year, total births per year, and year range.

---

### Collections
`GET /api/landing/{kind}`

Returns curated name lists by classification. `kind`: `extinct` | `endangered` | `rising` | `comeback`

---

### Birth year roster
`GET /api/year/{year}`

Top names for a given birth year (1880–2025).

---

### Individual year detail
`GET /api/decade/{decade}`

Top names by decade. `decade` format: `1990s`, `2000s`, etc.

---

### Compare names
`GET /api/compare?names=A,B,C`

Side-by-side yearly series for 2-3 names.

---

### Trajectory twins
`GET /api/twin/{name}?sex=M|F`

Names whose popularity arc over time is most similar to `{name}` (cosine similarity on yearly counts). Returns top 5 matches.

---

### Year-over-year movers
`GET /api/movers/{year}`

Rank changes for the top 100 names of each sex vs. the prior year: gainers, losers, and new entrants.

## Name Classification

Classifications are computed at ingest time from SSA data:

| Status | Meaning |
|--------|---------|
| `rising` | Gaining share of total births year-over-year |
| `stable` | Holding position with low variance |
| `declining` | Losing share, still in active use |
| `endangered` | Near-zero recent counts, at risk of extinction |
| `extinct` | Zero births in the most recent years on record |

## Data Notes

- Source: U.S. Social Security Administration (public domain)
- Coverage: ~100,000 unique name/sex pairs, ~1.9M year/count data points
- SSA suppresses names with fewer than 5 births in a given year (those years are omitted)
- Data updates annually, typically in May

## Example Usage

```
# Look up the full history of the name "Hazel"
GET https://nobodynamed.com/api/name/Hazel

# Find names starting with "Th"
GET https://nobodynamed.com/api/search?q=Th

# Get currently rising names
GET https://nobodynamed.com/api/landing/rising
```
