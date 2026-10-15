#!/usr/bin/env python3
"""
The reign of the #1 name — the share of all U.S. births of each sex that went to
that sex's single most popular name, 1880-2025.

Source: production D1 database "name-vitals", read-only query over
names + name_years + year_totals (the top name per year & sex, joined to the
annual tallies). The same rows are checked in at
viz/data/top-name-share-by-year.csv so the figure reproduces offline.

Run:
    uv run --with matplotlib --with pandas python viz/top-name-share.gen.py

Writes:
    viz/top-name-share.png
    viz/top-name-share.svg
"""
from __future__ import annotations

import pathlib

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.ticker import FuncFormatter

HERE = pathlib.Path(__file__).resolve().parent

GIRLS = "#C2185B"
BOYS = "#1565C0"
INK = "#101828"
MUTED = "#667085"
FAINT = "#E4E7EC"

df = pd.read_csv(HERE / "data" / "top-name-share-by-year.csv")
df["female_share"] = 100 * df["female_top_count"] / df["female_births"]
df["male_share"] = 100 * df["male_top_count"] / df["male_births"]


def share(sex: str, year: int) -> float:
    return float(df.loc[df["year"] == year, f"{sex}_share"].iloc[0])


fig, ax = plt.subplots(figsize=(11.5, 7.0), dpi=150)
fig.patch.set_facecolor("white")
ax.set_facecolor("white")

ax.grid(axis="y", color=FAINT, lw=0.9, zorder=0)
ax.set_axisbelow(True)

girls_line, = ax.plot(
    df["year"], df["female_share"], color=GIRLS, lw=2.6, zorder=3,
    label="Girls \u2014 share taken by the #1 girl name",
)
boys_line, = ax.plot(
    df["year"], df["male_share"], color=BOYS, lw=2.6, zorder=3,
    label="Boys \u2014 share taken by the #1 boy name",
)

# Mark the record years: the 1880 start, the 1947 boom, and today.
for sex, year, color in (
    ("female", 1880, GIRLS), ("female", 1947, GIRLS), ("female", 2025, GIRLS),
    ("male", 1880, BOYS), ("male", 1947, BOYS), ("male", 2025, BOYS),
):
    ax.scatter([year], [share(sex, year)], s=26, color=color, zorder=5,
               edgecolor="white", linewidth=1.2)


def callout(sex: str, year: int, text: str, x_text: float, y_text: float, color: str) -> None:
    """A floating label with a thin leader line back to its point on the series."""
    ax.plot(
        [year + 3, x_text - 1.6], [share(sex, year), y_text],
        color=color, lw=1.0, alpha=0.5, zorder=2, solid_capstyle="round",
    )
    ax.text(x_text, y_text, text, fontsize=10, fontweight="bold",
            color=color, ha="left", va="center", zorder=6)


# 1947, the last year a single name still took more than 5% of a whole sex.
callout("female", 1947, f"Linda, 1947 \u00b7 {share('female', 1947):.1f}%", 1956, 7.0, GIRLS)
callout("male", 1947, f"James, 1947 \u00b7 {share('male', 1947):.1f}%", 1956, 6.35, BOYS)

# A short read of the whole curve, parked in the empty lower right.
ax.text(2004, 4.6,
        "In 1880, 1 in 12 births\nof that sex carried the\ntop name. By 2025, 1 in 100.",
        fontsize=9.5, color=MUTED, ha="left", va="top", linespacing=1.55)

# Value labels at both ends of the series.
first, last = df.iloc[0], df.iloc[-1]
ax.text(1876, first["male_share"], f"John {first['male_share']:.1f}%", color=BOYS,
        fontsize=10, fontweight="bold", va="center", ha="right")
ax.text(1876, first["female_share"], f"Mary {first['female_share']:.1f}%", color=GIRLS,
        fontsize=10, fontweight="bold", va="center", ha="right")
ax.text(2027, last["male_share"], f"Liam {last['male_share']:.1f}%", color=BOYS,
        fontsize=10, fontweight="bold", va="center", ha="left")
ax.text(2027, last["female_share"], f"Olivia {last['female_share']:.1f}%", color=GIRLS,
        fontsize=10, fontweight="bold", va="center", ha="left")

# Titles
ax.text(0, 1.14, "No name rules America the way John and Mary once did",
        transform=ax.transAxes, fontsize=16.5, fontweight="bold", color=INK, va="bottom")
ax.text(0, 1.055,
        "Share of all U.S. births of each sex taken by that sex's single most popular name, 1880\u20132025",
        transform=ax.transAxes, fontsize=10.5, color=MUTED, va="bottom")

ax.legend(loc="upper right", frameon=False, fontsize=9.5, handlelength=1.8,
          labelcolor=MUTED, borderaxespad=0.4)

ax.set_xlim(1862, 2044)
ax.set_ylim(0, 9.8)
ax.set_xticks(range(1880, 2041, 20))
ax.set_yticks(range(0, 9, 2))
ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:.0f}%"))
ax.tick_params(colors=MUTED, labelsize=10, length=0)
for side in ("top", "right"):
    ax.spines[side].set_visible(False)
for side in ("left", "bottom"):
    ax.spines[side].set_color(FAINT)

ax.text(0, -0.115,
        "Source: SSA baby-name records via the Name Vitals D1 database (names, name_years, year_totals). "
        "2025 is the most recent year published.",
        transform=ax.transAxes, fontsize=8.5, color=MUTED, va="top")

fig.tight_layout()
fig.savefig(HERE / "top-name-share.png", dpi=200, bbox_inches="tight", facecolor="white")
fig.savefig(HERE / "top-name-share.svg", bbox_inches="tight", facecolor="white")

# Keep references alive for the layout checker / interactive use.
GIRLS_LINE, BOYS_LINE = girls_line, boys_line
print(f"wrote {HERE / 'top-name-share.png'}")
print(f"wrote {HERE / 'top-name-share.svg'}")
