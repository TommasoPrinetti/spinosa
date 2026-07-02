#!/usr/bin/env python3
"""Vertical Bar Chart -- bars grow upward using block chars.

Cookguide:
  1. Data Intake: gather labeled numeric values
  2. Arrange: build JSON with bars[{label, value}]
  3. Viz: python3 scripts/vertical-bar.py --input data.json --title "..." --width 52 --height 8
  4. Validate: tallest bar equals max_value -- bar heights proportional

Input JSON: {bars: [{label: str, value: float}]}
"""

import argparse
import json
import sys

BLOCK_CHARS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
FULL = '█'
EMPTY = ' '


def load_data(input_path):
    if input_path:
        with open(input_path) as f:
            return json.load(f)
    return json.load(sys.stdin)


def pick_block(frac):
    if frac <= 0:
        return EMPTY
    if frac >= 1.0:
        return FULL
    idx = int(frac * 7)
    if idx > 6:
        idx = 6
    if idx < 0:
        idx = 0
    return ['▁', '▂', '▃', '▄', '▅', '▆', '▇'][idx]


def build_chart(data, title, width, height, show_values):
    bars = data['bars']
    num_bars = len(bars)

    if num_bars > 20:
        print("Error: too many bars for vertical chart (max 20)", file=sys.stderr)
        sys.exit(1)

    content_width = width - 4

    # distribute space: each bar gets equal column width
    gap = 1
    raw = content_width - gap * (num_bars - 1)
    if raw < num_bars:
        print("Error: too narrow for bars", file=sys.stderr)
        sys.exit(1)
    bar_width = max(4, raw // num_bars)  # minimum 4 for labels like "Ex16"

    # ensure bar_width fits the longest label
    max_label_len = max(len(b['label']) for b in bars)
    if max_label_len > bar_width:
        bar_width = max_label_len
        # recalculate if wider bar_width exceeds content
        needed = bar_width * num_bars + gap * (num_bars - 1)
        if needed > content_width:
            print(f"Warning: labels require width {needed}, available {content_width}, truncating", file=sys.stderr)

    max_value = max(b['value'] for b in bars)
    if max_value == 0:
        max_value = 1

    # compute bar heights as float
    bar_heights = [(b['value'] / max_value) * height for b in bars]

    lines = []

    # helper: build content between │ │ borders, padded to content_width
    def render_content(cells):
        s = ''
        for i, cell in enumerate(cells):
            s += cell
            if i < num_bars - 1:
                s += ' ' * gap
        return s.ljust(content_width)

    # --- top border ---
    right_fill = width - 5 - len(title)
    if right_fill < 1:
        right_fill = 1
    lines.append('┌─ ' + title + ' ' + '─' * right_fill + '┐')

    # --- value row (optional) ---
    if show_values:
        cells = []
        for i, b in enumerate(bars):
            v = str(b['value'])
            cw = bar_width
            lp = (cw - len(v)) // 2
            rp = cw - len(v) - lp
            cells.append(' ' * lp + v + ' ' * rp)
        lines.append('│ ' + render_content(cells) + ' │')

    # --- bar rows (top to bottom) ---
    for r in range(height):
        cells = []
        for i, bh in enumerate(bar_heights):
            from_bottom = height - 1 - r
            cell_char = EMPTY
            if from_bottom < int(bh):
                cell_char = FULL
            elif from_bottom == int(bh):
                frac = bh - int(bh)
                cell_char = pick_block(frac)
            cells.append(cell_char * bar_width)
        lines.append('│ ' + render_content(cells) + ' │')

    # --- label row ---
    cells = []
    for i, b in enumerate(bars):
        label = b['label']
        cw = bar_width
        if len(label) >= cw:
            cells.append(label[:cw])
        else:
            lp = (cw - len(label)) // 2
            rp = cw - len(label) - lp
            cells.append(' ' * lp + label + ' ' * rp)
    lines.append('│ ' + render_content(cells) + ' │')

    # --- bottom border ---
    lines.append('└' + '─' * (width - 2) + '┘')

    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description='Vertical bar chart')
    parser.add_argument('--input', '-i', help='Input JSON file (default: stdin)')
    parser.add_argument('--title', default='', help='Chart title')
    parser.add_argument('--width', type=int, default=52, help='Chart total width (default: 52)')
    parser.add_argument('--height', type=int, default=8, help='Chart height in rows (default: 8)')
    parser.add_argument('--show-values', action='store_true', default=True, help='Show values atop bars (default: True)')
    args = parser.parse_args()

    data = load_data(args.input)
    chart = build_chart(data, args.title, args.width, args.height, args.show_values)
    print(chart)

    values = [b['value'] for b in data['bars']]
    print(f"\nVertical bar chart: {len(data['bars'])} categories, range {min(values)}--{max(values)}.")


if __name__ == '__main__':
    main()
