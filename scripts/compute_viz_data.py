#!/usr/bin/env python3
"""Compute visualization data for the three new charts from baby-names.csv."""

import csv
import json
import math
from collections import defaultdict

CSV_PATH = '/home/user/babynames/extra/baby-names.csv'

def load_data():
    """Load baby-names.csv into a structured format."""
    records = []
    with open(CSV_PATH) as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append({
                'year': int(row['year']),
                'name': row['name'],
                'percent': float(row['percent']),
                'sex': row['sex']
            })
    return records

def compute_diversity(records):
    """Compute naming diversity index per year.

    Since the CSV is top-1000 per gender, unique counts are meaningless.
    We focus on: top-10 concentration, top-50 concentration, and Shannon entropy.
    """
    by_year_sex = defaultdict(lambda: defaultdict(list))
    for r in records:
        by_year_sex[r['year']][r['sex']].append(r['percent'])

    result = []
    for year in sorted(by_year_sex.keys()):
        d = by_year_sex[year]
        boy_pcts = sorted(d.get('boy', []), reverse=True)
        girl_pcts = sorted(d.get('girl', []), reverse=True)

        top10_boy = sum(boy_pcts[:10])
        top10_girl = sum(girl_pcts[:10])
        top50_boy = sum(boy_pcts[:50])
        top50_girl = sum(girl_pcts[:50])

        def entropy(pcts):
            h = 0
            for p in pcts:
                if p > 0:
                    h -= p * math.log2(p)
            return round(h, 3)

        result.append({
            'year': year,
            'top10boyPct': round(top10_boy, 4),
            'top10girlPct': round(top10_girl, 4),
            'top50boyPct': round(top50_boy, 4),
            'top50girlPct': round(top50_girl, 4),
            'coverageBoy': round(sum(boy_pcts), 4),
            'coverageGirl': round(sum(girl_pcts), 4),
            'entropyBoy': entropy(boy_pcts),
            'entropyGirl': entropy(girl_pcts),
        })

    return result

def compute_rise_and_fall(records):
    """Find names with the most dramatic rise-and-fall arcs.

    We want names like Linda, Jennifer, Jason - names that had a sharp,
    distinctive peak rather than a slow plateau. Score = peak prominence
    relative to the surrounding decades (peak_pct / median_pct_over_lifespan).
    """
    by_name = defaultdict(lambda: {'sex': None, 'years': {}})
    for r in records:
        key = f"{r['name']}-{r['sex']}"
        by_name[key]['sex'] = r['sex']
        by_name[key]['name'] = r['name']
        by_name[key]['years'][r['year']] = r['percent']

    all_years = sorted(set(r['year'] for r in records))
    max_year = all_years[-1]

    candidates = []
    for key, info in by_name.items():
        years = info['years']
        if not years:
            continue

        peak_year = max(years, key=lambda y: years[y])
        peak_pct = years[peak_year]

        # Must reach at least 1% at peak (a real cultural phenomenon)
        if peak_pct < 0.01:
            continue

        # Must have fallen: value at end must be < 25% of peak
        end_pct = years.get(max_year, 0)
        if end_pct > 0.25 * peak_pct:
            continue

        # Compute "spikiness": how much the peak stands above the name's
        # average usage. Names with a sharp distinctive peak score highest.
        nonzero_pcts = [p for p in years.values() if p > 0]
        avg_pct = sum(nonzero_pcts) / len(nonzero_pcts)
        spikiness = peak_pct / avg_pct if avg_pct > 0 else 0

        # Also factor in absolute peak to ensure cultural significance
        score = spikiness * math.sqrt(peak_pct)

        # Build full time series
        values = []
        for y in all_years:
            values.append({'year': y, 'pct': round(years.get(y, 0), 6)})

        candidates.append({
            'name': info['name'],
            'sex': info['sex'],
            'peakYear': peak_year,
            'peakPct': round(peak_pct, 4),
            'score': score,
            'values': values
        })

    # Sort by score, take top 18 per gender
    boys = sorted([c for c in candidates if c['sex'] == 'boy'], key=lambda x: -x['score'])
    girls = sorted([c for c in candidates if c['sex'] == 'girl'], key=lambda x: -x['score'])

    selected = boys[:18] + girls[:18]

    # Ensure iconic names are included
    selected_names = {(s['name'], s['sex']) for s in selected}
    must_include = [('Jennifer', 'girl')]
    for name, sex in must_include:
        if (name, sex) not in selected_names:
            match = [c for c in candidates if c['name'] == name and c['sex'] == sex]
            if match:
                selected.append(match[0])

    # Remove score field, sort by peak year
    for s in selected:
        del s['score']
    selected.sort(key=lambda x: x['peakYear'])

    return selected

def compute_letter_heatmap(records):
    """Compute first-letter frequency by year, split by gender."""
    by_year = defaultdict(lambda: defaultdict(lambda: {'M': 0, 'F': 0}))

    for r in records:
        letter = r['name'][0].upper()
        gender_key = 'M' if r['sex'] == 'boy' else 'F'
        by_year[r['year']][letter][gender_key] += r['percent']

    result = []
    for year in sorted(by_year.keys()):
        letters = {}
        for l in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ':
            d = by_year[year].get(l, {'M': 0, 'F': 0})
            letters[l] = {'M': round(d['M'], 4), 'F': round(d['F'], 4)}
        result.append({'year': year, 'letters': letters})

    return result

def main():
    print("Loading data...", flush=True)
    records = load_data()
    print(f"Loaded {len(records)} records")

    print("Computing diversity data...", flush=True)
    diversity = compute_diversity(records)
    print(f"  {len(diversity)} years, top10boy 1880: {diversity[0]['top10boyPct']}, 2008: {diversity[-1]['top10boyPct']}")
    print(f"  Entropy boy 1880: {diversity[0]['entropyBoy']}, 2008: {diversity[-1]['entropyBoy']}")

    print("Computing rise-and-fall names...", flush=True)
    risefall = compute_rise_and_fall(records)
    print(f"  {len(risefall)} names: {[n['name'] for n in risefall]}")

    print("Computing letter heatmap...", flush=True)
    letters = compute_letter_heatmap(records)
    print(f"  {len(letters)} years")

    # Output as JS
    with open('/home/user/babynames/scripts/viz_data_output.js', 'w') as f:
        f.write(f"const diversityData = {json.dumps(diversity, separators=(',', ':'))};\n\n")
        f.write(f"const riseAndFall = {json.dumps(risefall, separators=(',', ':'))};\n\n")
        f.write(f"const lettersByYear = {json.dumps(letters, separators=(',', ':'))};\n")

    print("Written to scripts/viz_data_output.js")

if __name__ == '__main__':
    main()
