"""
Build client-side data for Name Vitals.

Input: data/babynames.rda (Hadley Wickham's CC0 mirror of SSA baby names 1880-2017)
Output (all written to name-vitals/data/):
  names/<letter>.json       Per-first-letter shard. See SHARD FORMAT below.
  index.json                Top names for featured/autocomplete fallback.
  meta.json                 Totals per year by sex + top-10 per year + year range.
  landing/extinct.json      Peaked >=500, absent from last 10 years.
  landing/endangered.json   Declined >=90% from peak, <=50 last year, peaked >=500.
  landing/rising.json       Latest decade >=5x previous decade, latest year >=100.

SHARD FORMAT:
  { "ym": 1880, "yM": 2017, "n": {
      "Amy|F": [firstYear, countFirstYear, countFirstYear+1, ..., countLastYearSeen],
      "Amy|M": [...],
      ...
  }}
  The count array runs contiguously from firstYear to the last year the
  name appeared (>=5 per SSA rules). Years outside that window are zero.

Re-run after refreshing data/babynames.rda; the schema is stable.
"""
from __future__ import annotations
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

import rdata

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "babynames.rda"
OUT = ROOT / "name-vitals" / "data"
NAMES_DIR = OUT / "names"
LANDING_DIR = OUT / "landing"


def load_df():
    parsed = rdata.read_rda(str(SRC))
    df = parsed["babynames"]
    df = df.copy()
    df["year"] = df["year"].astype(int)
    df["n"] = df["n"].astype(int)
    df["name"] = df["name"].astype(str)
    df["sex"] = df["sex"].astype(str)
    return df


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        json.dump(obj, f, separators=(",", ":"))


def shard_letter(name: str) -> str:
    ch = name[:1].upper()
    return ch if "A" <= ch <= "Z" else "_"


def main() -> None:
    if not SRC.exists():
        sys.exit(f"missing {SRC}; download hadley/babynames babynames.rda first")

    NAMES_DIR.mkdir(parents=True, exist_ok=True)
    LANDING_DIR.mkdir(parents=True, exist_ok=True)

    print("loading rda...", file=sys.stderr)
    df = load_df()
    ym, yM = int(df["year"].min()), int(df["year"].max())
    print(f"rows={len(df):,}  years={ym}-{yM}", file=sys.stderr)

    # series[name][sex] = {year: count}
    series: dict[str, dict[str, dict[int, int]]] = defaultdict(lambda: defaultdict(dict))
    totals_by_year: dict[int, dict[str, int]] = defaultdict(lambda: {"M": 0, "F": 0})
    rows_by_year: dict[int, list[tuple[int, str, str]]] = defaultdict(list)

    for year, sex, name, n in zip(df["year"], df["sex"], df["name"], df["n"], strict=True):
        y = int(year)
        c = int(n)
        series[name][sex][y] = c
        totals_by_year[y][sex] += c
        rows_by_year[y].append((c, name, sex))

    print(f"names={len(series):,}", file=sys.stderr)

    # Per-letter shards: keys "name|M" or "name|F" -> [firstYear, c0, c1, ..., cLast]
    shards: dict[str, dict[str, list[int]]] = defaultdict(dict)
    for name, by_sex in series.items():
        letter = shard_letter(name)
        for sex, yr_counts in by_sex.items():
            if not yr_counts:
                continue
            first = min(yr_counts)
            last = max(yr_counts)
            arr = [first] + [yr_counts.get(y, 0) for y in range(first, last + 1)]
            shards[letter][f"{name}|{sex}"] = arr

    for letter, rows in shards.items():
        write_json(NAMES_DIR / f"{letter}.json", {"ym": ym, "yM": yM, "n": rows})

    # Autocomplete index: list of [name, sexMask, peakCount, peakYear] sorted by peakCount desc.
    # sexMask: 1=M, 2=F, 3=both.
    index_rows: list[list] = []
    for name, by_sex in series.items():
        mask = 0
        peak_count = 0
        peak_year = 0
        for sex, yr_counts in by_sex.items():
            mask |= 1 if sex == "M" else 2
            for y, c in yr_counts.items():
                if c > peak_count:
                    peak_count = c
                    peak_year = y
        index_rows.append([name, mask, peak_count, peak_year])
    index_rows.sort(key=lambda r: (-r[2], r[0]))
    # Keep a featured list (top 5000 by peak) to keep index.json small; shards
    # supply full lookup for anything the user types.
    featured = index_rows[:5000]

    totals_M = [totals_by_year[y]["M"] for y in range(ym, yM + 1)]
    totals_F = [totals_by_year[y]["F"] for y in range(ym, yM + 1)]

    write_json(
        OUT / "index.json",
        {
            "ym": ym,
            "yM": yM,
            "totals": {"M": totals_M, "F": totals_F},
            "featured": featured,
            "totalNames": len(index_rows),
        },
    )

    # meta.json: light aggregates we might want for SEO/fun-stats
    top_per_year = {}
    for y, rows in rows_by_year.items():
        ms = sorted([r for r in rows if r[2] == "M"], key=lambda t: -t[0])[:10]
        fs = sorted([r for r in rows if r[2] == "F"], key=lambda t: -t[0])[:10]
        top_per_year[str(y)] = [[n, s, c] for c, n, s in (fs + ms)]
    write_json(
        OUT / "meta.json",
        {
            "ym": ym,
            "yM": yM,
            "totalNames": len(series),
            "totalRows": int(len(df)),
            "totalsByYear": {str(y): totals_by_year[y] for y in range(ym, yM + 1)},
            "top10PerYear": top_per_year,
        },
    )

    # Landing-page datasets
    last_year = yM
    first_year = ym

    # Peak year & total counts per (name, sex)
    rank_by_year_sex: dict[tuple[int, str], dict[str, int]] = defaultdict(dict)
    for y, rows in rows_by_year.items():
        ms = sorted([r for r in rows if r[2] == "M"], key=lambda t: -t[0])
        fs = sorted([r for r in rows if r[2] == "F"], key=lambda t: -t[0])
        for rank, (c, n, s) in enumerate(ms, start=1):
            rank_by_year_sex[(y, "M")][n] = rank
        for rank, (c, n, s) in enumerate(fs, start=1):
            rank_by_year_sex[(y, "F")][n] = rank

    def latest_count(name, sex):
        return series[name][sex].get(last_year, 0)

    def peak_info(name, sex):
        yr_counts = series[name][sex]
        if not yr_counts:
            return (0, 0)
        peak_y = max(yr_counts, key=lambda y: yr_counts[y])
        return (peak_y, yr_counts[peak_y])

    def decade_total(name, sex, start):
        return sum(c for y, c in series[name][sex].items() if start <= y < start + 10)

    extinct = []
    endangered = []
    rising = []

    for name, by_sex in series.items():
        for sex, yr_counts in by_sex.items():
            if not yr_counts:
                continue
            peak_y, peak_c = peak_info(name, sex)
            latest = yr_counts.get(last_year, 0)
            first_seen = min(yr_counts)
            total_years = len(yr_counts)

            # Shared compact series for tiny sparklines on landing pages
            series_arr = [yr_counts.get(y, 0) for y in range(first_year, last_year + 1)]

            # Extinct: peak >= 500, not in latest year, and hasn't appeared in last 10 years
            if peak_c >= 500 and latest == 0:
                last_nonzero = max(yr_counts)
                if last_year - last_nonzero >= 10:
                    extinct.append(
                        {
                            "name": name,
                            "sex": sex,
                            "peakYear": peak_y,
                            "peakCount": peak_c,
                            "lastYearSeen": last_nonzero,
                            "series": series_arr,
                        }
                    )

            # Endangered: peak >= 500, latest > 0 and <= peak*0.1, and <= 50 in latest year
            if peak_c >= 500 and 0 < latest <= 50 and latest <= peak_c * 0.1:
                endangered.append(
                    {
                        "name": name,
                        "sex": sex,
                        "peakYear": peak_y,
                        "peakCount": peak_c,
                        "latestCount": latest,
                        "declinePct": round(100 * (1 - latest / peak_c), 1),
                        "series": series_arr,
                    }
                )

            # Rising: latest decade total >= 5x previous decade, and latest year >= 100
            prev = decade_total(name, sex, last_year - 19)  # years [yM-19, yM-10]
            curr = decade_total(name, sex, last_year - 9)   # years [yM-9, yM]
            if latest >= 100 and prev >= 10 and curr >= prev * 5:
                rising.append(
                    {
                        "name": name,
                        "sex": sex,
                        "latestCount": latest,
                        "prevDecadeTotal": prev,
                        "currDecadeTotal": curr,
                        "growthX": round(curr / prev, 1) if prev else None,
                        "series": series_arr,
                    }
                )

    extinct.sort(key=lambda r: -r["peakCount"])
    endangered.sort(key=lambda r: -r["peakCount"])
    rising.sort(key=lambda r: -r["currDecadeTotal"])

    write_json(LANDING_DIR / "extinct.json", {"yM": last_year, "rows": extinct[:500]})
    write_json(LANDING_DIR / "endangered.json", {"yM": last_year, "rows": endangered[:500]})
    write_json(LANDING_DIR / "rising.json", {"yM": last_year, "rows": rising[:500]})

    print(f"extinct={len(extinct)}  endangered={len(endangered)}  rising={len(rising)}", file=sys.stderr)
    print("done", file=sys.stderr)


if __name__ == "__main__":
    main()
