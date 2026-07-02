#!/usr/bin/env python3
"""Categorical Histogram — grouped or stacked bars per bin, one series per shade.

Cookguide:
  1. Data Intake: gather bin labels + multi-series values
  2. Arrange: build JSON with bin_labels, series[{name, values}]
  3. Viz: python3 scripts/categorical-histogram.py --input data.json --title "..." --width 52
  4. Validate: total bar proportions match values — shade chars match series

Input JSON: {bin_labels: [str], series: [{name: str, values: [float]}]}
"""

import json
import sys
import argparse

SHADES = ['█', '▓', '▒', '░']


def make_top(width: int, title: str) -> str:
    if title:
        inner = f" {title} "
        left = f"┌─{inner}"
        need = width - len(left) - 1
        return left + "─" * max(need, 0) + "┐"
    return f"┌─{'─' * (width - 3)}┐"


def make_bottom(width: int) -> str:
    return f"└{'─' * (width - 2)}┘"


def format_row(width: int, label: str, bar: str, value_str: str) -> str:
    row = f"│ {label} {bar} {value_str} "
    return row.ljust(width - 1) + "│"


def distribution(values, total_width):
    """Distribute total_width among values proportionally, handling rounding."""
    if not values:
        return []
    total = sum(values)
    if total == 0:
        return [0] * len(values)
    raw = [v / total * total_width for v in values]
    result = [int(r) for r in raw]
    remainder = total_width - sum(result)
    fractions = [(r - int(r), i) for i, r in enumerate(raw)]
    fractions.sort(key=lambda x: -x[0])
    for i in range(remainder):
        if i < len(fractions):
            result[fractions[i][1]] += 1
    return result


def main():
    parser = argparse.ArgumentParser(description="Categorical Histogram")
    parser.add_argument("--input", type=str, help="Input JSON file")
    parser.add_argument("--title", type=str, default="", help="Chart title")
    parser.add_argument("--width", type=int, default=52, help="Total box width")
    parser.add_argument("--max-value", type=float, default=None, help="Override max for consistent scale")
    parser.add_argument("--grouped", action="store_true", help="Grouped mode (default: stacked)")
    args = parser.parse_args()

    if args.input:
        with open(args.input) as f:
            data = json.load(f)
    else:
        data = json.load(sys.stdin)

    bin_labels = data["bin_labels"]
    series = data["series"]
    n_series = len(series)

    if n_series > 4:
        print(f"Warning: {n_series} series > 4, wraparound pattern used", file=sys.stderr)

    all_values = [v for s in series for v in s["values"] if v is not None]
    global_max = args.max_value if args.max_value is not None else (max(all_values) if all_values else 1)

    max_bin_label = max((len(l) for l in bin_labels), default=0)
    max_series_name = max((len(s["name"]) for s in series), default=0)
    label_width = max_bin_label + 1 + max_series_name
    label_width = max(label_width, 10)

    val_strs = ["?" if v is None else str(v) for s in series for v in s["values"]]
    value_width = max((len(vs) for vs in val_strs), default=1)

    max_bar = args.width - 6 - label_width - value_width
    max_bar = max(max_bar, 5)

    top = make_top(args.width, args.title)
    bottom = make_bottom(args.width)

    rows = []
    for b_idx, bin_label in enumerate(bin_labels):
        for s_idx, s in enumerate(series):
            shade = SHADES[s_idx % len(SHADES)]
            val = s["values"][b_idx] if b_idx < len(s["values"]) else None
            val_str = str(val) if val is not None else "?"

            if s_idx == 0:
                label = f"{bin_label} {s['name']}"
            else:
                label = " " * max_bin_label + " " + s["name"]
            label = label.ljust(label_width)

            if args.grouped:
                if val is not None:
                    filled = round((val / global_max) * max_bar)
                    filled = min(filled, max_bar)
                else:
                    filled = 0
                bar = shade * filled + "░" * (max_bar - filled)
            else:
                # Stacked: compute composition bar for entire bin, show same bar per row
                bin_vals = []
                for ss in series:
                    bv = ss["values"][b_idx] if b_idx < len(ss["values"]) else None
                    bin_vals.append(bv)
                segs = distribution(
                    [v if v is not None else 0 for v in bin_vals],
                    max_bar,
                )
                bar_chars = []
                for si in range(n_series):
                    bar_chars.append(SHADES[si % len(SHADES)] * segs[si])
                remaining = max_bar - sum(segs)
                bar_chars.append("░" * remaining)
                bar = "".join(bar_chars)

            rows.append(format_row(args.width, label, bar, val_str))

    print(top)
    for row in rows:
        print(row)
    print(bottom)
    print()

    shades_line = " ".join(SHADES[i % len(SHADES)] for i in range(n_series))
    print(f"Series: {' | '.join(s['name'] for s in series)}")
    print(f"Shades: {shades_line}")
    mode = "Stacked" if not args.grouped else "Grouped"
    print(f"{mode} bars per bin. "
          f"Bar lengths proportional to value / global_max ({global_max}).")
    print(f"Total width: {args.width} chars. Label width: {label_width}. "
          f"Max bar: {max_bar}.")


if __name__ == "__main__":
    main()
