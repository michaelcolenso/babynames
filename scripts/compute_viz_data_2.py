#!/usr/bin/env python3
"""Compute data for 5 new visualizations from baby-names.csv."""

import csv
import json
import math
from collections import defaultdict

CSV_PATH = '/home/user/babynames/extra/baby-names.csv'

def load_data():
    records = []
    with open(CSV_PATH) as f:
        for row in csv.DictReader(f):
            records.append({
                'year': int(row['year']),
                'name': row['name'],
                'percent': float(row['percent']),
                'sex': row['sex']
            })
    return records

def compute_halflife(records):
    """Scatter plot: peak year vs half-life for names with peak > 0.5%."""
    by_name = defaultdict(lambda: {'sex': None, 'years': {}})
    for r in records:
        key = f"{r['name']}-{r['sex']}"
        by_name[key]['sex'] = r['sex']
        by_name[key]['name'] = r['name']
        by_name[key]['years'][r['year']] = r['percent']

    all_years = sorted(set(r['year'] for r in records))
    max_year = all_years[-1]

    results = []
    for key, info in by_name.items():
        years = info['years']
        peak_year = max(years, key=lambda y: years[y])
        peak_pct = years[peak_year]

        if peak_pct < 0.005:
            continue

        # Compute half-life: years after peak to drop below 50% of peak
        half_threshold = peak_pct * 0.5
        half_life = None
        for y in range(peak_year + 1, max_year + 1):
            if years.get(y, 0) < half_threshold:
                half_life = y - peak_year
                break

        if half_life is None:
            # Still above half at end of data - use remaining years as lower bound
            # but mark as censored
            half_life = max_year - peak_year
            if half_life < 3:
                continue  # Skip names peaking near end of data

        results.append({
            'name': info['name'],
            'sex': 'M' if info['sex'] == 'boy' else 'F',
            'peakYear': peak_year,
            'peakPct': round(peak_pct * 100, 2),
            'halfLife': half_life,
        })

    return results


def compute_name_endings(records):
    """Streamgraph of name ending patterns over time."""
    # Use last 1 or 2 characters as ending, then find the most common ones
    # First pass: count all 2-char and 1-char endings to find the best groupings
    ending_counts = defaultdict(float)
    for r in records:
        name = r['name'].lower()
        if len(name) >= 2:
            ending_counts[name[-2:]] += r['percent']
        ending_counts[name[-1:]] += r['percent']

    # Pick the top 2-char endings, then use 1-char for the rest
    two_char = sorted([(e, c) for e, c in ending_counts.items() if len(e) == 2],
                       key=lambda x: -x[1])

    # Take top 12 two-char endings that are distinctive
    selected_2char = [e for e, c in two_char[:20]]

    def get_ending(name):
        name = name.lower()
        if len(name) >= 2 and name[-2:] in selected_2char:
            return '-' + name[-2:]
        return '-' + name[-1]

    # Now compute by year
    by_year_ending = defaultdict(lambda: defaultdict(float))
    by_year_total = defaultdict(float)

    for r in records:
        ending = get_ending(r['name'])
        by_year_ending[r['year']][ending] += r['percent']
        by_year_total[r['year']] += r['percent']

    all_years = sorted(by_year_ending.keys())

    # Find top endings by total
    ending_totals = defaultdict(float)
    for year in all_years:
        for ending, pct in by_year_ending[year].items():
            ending_totals[ending] += pct

    top_endings = sorted(ending_totals, key=lambda e: -ending_totals[e])[:16]

    result = []
    for year in all_years:
        total = by_year_total[year]
        row = {'year': year}
        accounted = 0
        for ending in top_endings:
            val = by_year_ending[year].get(ending, 0)
            row[ending] = round(val / total, 4) if total > 0 else 0
            accounted += val
        row['other'] = round(max(0, (total - accounted) / total), 4) if total > 0 else 0
        result.append(row)

    return {'endings': top_endings + ['other'], 'data': result}


def compute_gender_drift(records):
    """Names that migrated across genders over time."""
    # Build per-name, per-year, per-sex data
    by_name_year = defaultdict(lambda: defaultdict(lambda: {'boy': 0, 'girl': 0}))

    for r in records:
        by_name_year[r['name']][r['year']][r['sex']] = r['percent']

    all_years = sorted(set(r['year'] for r in records))

    candidates = []
    for name, year_data in by_name_year.items():
        # Name must appear in both genders with meaningful presence
        total_boy = sum(yd.get('boy', 0) for yd in year_data.values())
        total_girl = sum(yd.get('girl', 0) for yd in year_data.values())

        if total_boy < 0.01 or total_girl < 0.01:
            continue

        # Compute "drift": did the gender ratio change significantly?
        # Look at first decade vs last decade of usage
        early_years = [y for y in sorted(year_data.keys()) if year_data[y]['boy'] + year_data[y]['girl'] > 0][:20]
        late_years = [y for y in sorted(year_data.keys()) if year_data[y]['boy'] + year_data[y]['girl'] > 0][-20:]

        if len(early_years) < 5 or len(late_years) < 5:
            continue

        early_boy = sum(year_data[y]['boy'] for y in early_years)
        early_girl = sum(year_data[y]['girl'] for y in early_years)
        early_ratio = early_boy / (early_boy + early_girl) if (early_boy + early_girl) > 0 else 0.5

        late_boy = sum(year_data[y]['boy'] for y in late_years)
        late_girl = sum(year_data[y]['girl'] for y in late_years)
        late_ratio = late_boy / (late_boy + late_girl) if (late_boy + late_girl) > 0 else 0.5

        drift = abs(late_ratio - early_ratio)
        peak_total = max(total_boy, total_girl)

        if drift < 0.25:
            continue

        # Build time series
        series = []
        for y in all_years:
            yd = year_data.get(y, {'boy': 0, 'girl': 0})
            b = yd.get('boy', 0)
            g = yd.get('girl', 0)
            if b + g > 0.0001:
                series.append({'year': y, 'boy': round(b, 6), 'girl': round(g, 6)})

        if len(series) < 10:
            continue

        direction = 'M→F' if late_ratio < early_ratio else 'F→M'

        candidates.append({
            'name': name,
            'direction': direction,
            'drift': drift,
            'peak': round(peak_total * 100, 2),
            'series': series,
        })

    # Sort by drift * peak to get the most dramatic and notable
    candidates.sort(key=lambda c: -(c['drift'] * c['peak']))
    selected = candidates[:16]
    for s in selected:
        del s['drift']

    return selected


def compute_decade_signature(records):
    """Radar chart data: per-decade naming characteristics."""
    by_year = defaultdict(list)
    for r in records:
        by_year[r['year']].append(r)

    all_years = sorted(by_year.keys())

    decades = []
    for decade_start in range(1880, 2010, 10):
        decade_end = min(decade_start + 9, max(all_years))
        decade_years = [y for y in all_years if decade_start <= y <= decade_end]
        if not decade_years:
            continue

        all_recs = []
        for y in decade_years:
            all_recs.extend(by_year[y])

        # 1. Average name length (weighted by percentage)
        total_weight = sum(r['percent'] for r in all_recs)
        avg_len = sum(len(r['name']) * r['percent'] for r in all_recs) / total_weight if total_weight > 0 else 5

        # 2. Top-10 concentration (avg across years)
        concentrations = []
        for y in decade_years:
            recs = by_year[y]
            boy_pcts = sorted([r['percent'] for r in recs if r['sex'] == 'boy'], reverse=True)
            girl_pcts = sorted([r['percent'] for r in recs if r['sex'] == 'girl'], reverse=True)
            concentrations.append((sum(boy_pcts[:10]) + sum(girl_pcts[:10])) / 2)
        avg_conc = sum(concentrations) / len(concentrations)

        # 3. Entropy (avg across years)
        entropies = []
        for y in decade_years:
            recs = by_year[y]
            pcts = [r['percent'] for r in recs if r['percent'] > 0]
            h = -sum(p * math.log2(p) for p in pcts)
            entropies.append(h)
        avg_entropy = sum(entropies) / len(entropies)

        # 4. New names rate: names in this decade not in previous 2 decades
        prev_names = set()
        for py in all_years:
            if decade_start - 20 <= py < decade_start:
                for r in by_year[py]:
                    prev_names.add(r['name'] + '-' + r['sex'])
        current_names = set()
        for y in decade_years:
            for r in by_year[y]:
                current_names.add(r['name'] + '-' + r['sex'])
        new_rate = len(current_names - prev_names) / len(current_names) if current_names else 0

        # 5. Gender-neutral rate: names appearing in both sexes this decade
        boy_names = set(r['name'] for r in all_recs if r['sex'] == 'boy')
        girl_names = set(r['name'] for r in all_recs if r['sex'] == 'girl')
        neutral_count = len(boy_names & girl_names)
        all_names = len(boy_names | girl_names)
        neutral_rate = neutral_count / all_names if all_names > 0 else 0

        # 6. Most common starting letter concentration
        letter_pcts = defaultdict(float)
        for r in all_recs:
            letter_pcts[r['name'][0]] += r['percent']
        top_letter_pct = max(letter_pcts.values()) / total_weight if total_weight > 0 else 0
        top_letter = max(letter_pcts, key=lambda l: letter_pcts[l])

        # 7. Ending letter -a concentration (for girls) and -n concentration (for boys)
        ending_a = sum(r['percent'] for r in all_recs if r['name'].lower().endswith('a') and r['sex'] == 'girl')
        girl_total = sum(r['percent'] for r in all_recs if r['sex'] == 'girl')
        ending_a_rate = ending_a / girl_total if girl_total > 0 else 0

        ending_n = sum(r['percent'] for r in all_recs if r['name'].lower().endswith('n') and r['sex'] == 'boy')
        boy_total = sum(r['percent'] for r in all_recs if r['sex'] == 'boy')
        ending_n_rate = ending_n / boy_total if boy_total > 0 else 0

        # 8. Name recycling: names returning after 30+ years of absence
        dormant_names = set()
        for name_sex in current_names:
            # Check if absent in previous 30 years but present before that
            absent_recent = True
            present_old = False
            n, s = name_sex.rsplit('-', 1)
            for py in all_years:
                recs_py = [r for r in by_year[py] if r['name'] == n and r['sex'] == s]
                if decade_start - 30 <= py < decade_start:
                    if recs_py:
                        absent_recent = False
                elif py < decade_start - 30:
                    if recs_py:
                        present_old = True
            if absent_recent and present_old:
                dormant_names.add(name_sex)
        recycle_rate = len(dormant_names) / len(current_names) if current_names else 0

        decades.append({
            'decade': f"{decade_start}s",
            'avgLen': round(avg_len, 2),
            'top10conc': round(avg_conc, 4),
            'entropy': round(avg_entropy, 2),
            'newNameRate': round(new_rate, 3),
            'neutralRate': round(neutral_rate, 3),
            'topLetterPct': round(top_letter_pct, 3),
            'topLetter': top_letter,
            'endingArate': round(ending_a_rate, 3),
            'endingNrate': round(ending_n_rate, 3),
            'recycleRate': round(recycle_rate, 4),
        })

    return decades


def compute_phantom_names(records):
    """Names that peaked in top 50 but never made top 10, then vanished."""
    by_name = defaultdict(lambda: {'sex': None, 'years': {}})
    for r in records:
        key = f"{r['name']}-{r['sex']}"
        by_name[key]['sex'] = r['sex']
        by_name[key]['name'] = r['name']
        by_name[key]['years'][r['year']] = r['percent']

    # Also compute per-year rankings
    by_year_sex = defaultdict(lambda: defaultdict(list))
    for r in records:
        by_year_sex[r['year']][r['sex']].append((r['name'], r['percent']))

    rankings = {}
    for year in by_year_sex:
        for sex in by_year_sex[year]:
            sorted_names = sorted(by_year_sex[year][sex], key=lambda x: -x[1])
            for rank, (name, pct) in enumerate(sorted_names, 1):
                rankings[(year, name, sex)] = rank

    all_years = sorted(set(r['year'] for r in records))
    max_year = all_years[-1]

    candidates = []
    for key, info in by_name.items():
        years = info['years']
        sex = info['sex']
        name = info['name']

        # Get best rank ever
        best_rank = 1000
        best_rank_year = None
        for y in years:
            rank = rankings.get((y, name, sex), 1000)
            if rank < best_rank:
                best_rank = rank
                best_rank_year = y

        # Must have reached top 50 but never top 10
        if best_rank > 50 or best_rank <= 10:
            continue

        peak_year = max(years, key=lambda y: years[y])
        peak_pct = years[peak_year]

        # Must have faded: end value < 20% of peak
        end_pct = years.get(max_year, 0)
        if peak_pct > 0 and end_pct / peak_pct > 0.2:
            continue

        # Build compact time series (only non-zero years)
        values = []
        for y in all_years:
            pct = years.get(y, 0)
            if pct > 0:
                values.append([y, round(pct * 100, 3)])

        if len(values) < 10:
            continue

        candidates.append({
            'name': name,
            'sex': 'M' if sex == 'boy' else 'F',
            'bestRank': best_rank,
            'peakYear': peak_year,
            'peakPct': round(peak_pct * 100, 2),
            'values': values,
            'score': peak_pct * (1 / max(1, best_rank - 10)),
        })

    candidates.sort(key=lambda c: -c['score'])
    selected = candidates[:40]
    for s in selected:
        del s['score']
    selected.sort(key=lambda s: s['peakYear'])
    return selected


def main():
    print("Loading data...", flush=True)
    records = load_data()
    print(f"Loaded {len(records)} records")

    print("1. Computing half-life data...", flush=True)
    halflife = compute_halflife(records)
    print(f"   {len(halflife)} names with half-life data")

    print("2. Computing name endings...", flush=True)
    endings = compute_name_endings(records)
    print(f"   {len(endings['endings'])} ending categories, {len(endings['data'])} years")

    print("3. Computing gender drift...", flush=True)
    drift = compute_gender_drift(records)
    print(f"   {len(drift)} gender-crossing names: {[d['name'] for d in drift]}")

    print("4. Computing decade signatures...", flush=True)
    decades = compute_decade_signature(records)
    print(f"   {len(decades)} decades")

    print("5. Computing phantom names...", flush=True)
    phantoms = compute_phantom_names(records)
    print(f"   {len(phantoms)} phantom names: {[p['name'] for p in phantoms]}")

    with open('/home/user/babynames/scripts/viz_data_output_2.js', 'w') as f:
        f.write(f"const halfLifeData = {json.dumps(halflife, separators=(',', ':'))};\n\n")
        f.write(f"const endingsData = {json.dumps(endings, separators=(',', ':'))};\n\n")
        f.write(f"const genderDriftData = {json.dumps(drift, separators=(',', ':'))};\n\n")
        f.write(f"const decadeSignatures = {json.dumps(decades, separators=(',', ':'))};\n\n")
        f.write(f"const phantomNames = {json.dumps(phantoms, separators=(',', ':'))};\n")

    print("Written to scripts/viz_data_output_2.js")

if __name__ == '__main__':
    main()
