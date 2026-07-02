#!/usr/bin/env python3
"""Matrix Heatmap — full 2D grid with row/col labels and variable cell widths.

Cookguide:
  1. Data Intake: gather row×col matrix with labels
  2. Arrange: build JSON with row_labels, col_labels, data (2D array), min, max
  3. Viz: python3 scripts/matrix-heatmap.py --input data.json --title "..." --width 52
  4. Validate: check shade intensity matches value — cell count equals rows×cols

Input JSON: {row_labels: [str], col_labels: [str], data: [[float]], min: float, max: float}
"""

import json
import sys
import argparse


def truncate(s, max_len):
    if len(s) <= max_len:
        return s
    return s[:max_len - 1] + '\u2026'


def shade_level(val, vmin, vmax):
    if vmax == vmin:
        return 0
    return round((val - vmin) / (vmax - vmin) * 3)


SHADES = ['\u2591', '\u2592', '\u2593', '\u2588']


def format_val(val, vmin, vmax):
    span = vmax - vmin
    if span <= 1 and vmin >= 0 and vmax <= 1:
        return f"{val:.2f}"
    return f"{val:.2f}"


def render_cell(val, vmin, vmax, cell_width, show_numbers):
    if val is None:
        return ' ' * cell_width
    if show_numbers:
        text = format_val(val, vmin, vmax)
        pad = cell_width - len(text)
        if pad <= 0:
            return text[:cell_width]
        left = pad // 2
        right = pad - left
        return '\u2591' * left + text + '\u2591' * right
    ch = SHADES[shade_level(val, vmin, vmax)]
    return ch * cell_width


def draw_matrix(data, row_labels, col_labels, vmin, vmax, title, width, cell_width, show_numbers):
    n_rows = len(data)
    n_cols = len(data[0]) if n_rows else 0

    if n_rows > 30:
        print(f"Warning: data has {n_rows} rows (>30). Rendering first 30 rows only.", file=sys.stderr)
        data = data[:30]
        row_labels = row_labels[:30]
        n_rows = 30

    if width < 10:
        print("Error: width must be at least 10.", file=sys.stderr)
        return

    label_width = max(len(l) for l in row_labels) if row_labels else 0
    label_width = max(1, min(12, label_width))

    internal = width - 2

    # --- top border ---
    max_title = width - 6
    dt = truncate(title, max(0, max_title))
    need = width - 5 - len(dt)
    top = '\u250c\u2500 ' + dt + ' \u2500' + '\u2500' * max(0, need) + '\u2510'

    # --- col header row ---
    context = f"{n_rows}\u00d7{n_cols}"
    ctx = truncate(context, label_width).ljust(label_width)
    spacer = ' ' * 2
    col_body = ' ' + ctx + spacer
    slot_w = cell_width + 2
    for h in col_labels:
        ht = truncate(h, max(1, slot_w))
        left = (slot_w - len(ht)) // 2
        right = slot_w - len(ht) - left
        col_body += ' ' * left + ht + ' ' * right
    col_body = col_body[:internal].ljust(internal)
    col_line = '\u2502' + col_body + '\u2502'

    # --- data rows ---
    labels_disp = [truncate(l, label_width) for l in row_labels]
    labels_pad = [l.ljust(label_width) for l in labels_disp]

    data_lines = []
    for r in range(n_rows):
        body = ' ' + labels_pad[r] + spacer
        for c in range(n_cols):
            body += render_cell(data[r][c], vmin, vmax, cell_width, show_numbers)
            if c < n_cols - 1:
                body += '  '
        body = body[:internal].ljust(internal)
        data_lines.append('\u2502' + body + '\u2502')

    # --- bottom border ---
    bot = '\u2514' + '\u2500' * (width - 2) + '\u2518'

    print(top)
    print(col_line)
    for l in data_lines:
        print(l)
    print(bot)
    print()
    print(f"Matrix heatmap: {n_rows} rows \u00d7 {n_cols} cols | values [{vmin}, {vmax}]")


def main():
    parser = argparse.ArgumentParser(description='Matrix Heatmap — full 2D grid with row/col labels')
    parser.add_argument('--input', '-i', type=str, help='Input JSON file (default: stdin)')
    parser.add_argument('--title', type=str, default='', help='Chart title')
    parser.add_argument('--width', type=int, default=52, help='Total chart width in chars')
    parser.add_argument('--cell-width', type=int, default=4, help='Width of each cell in chars')
    parser.add_argument('--show-numbers', action='store_true', default=True, help='Print values inside cells')
    parser.add_argument('--no-numbers', action='store_true', help='Disable numbers in cells (shade only)')
    args = parser.parse_args()

    show_numbers = args.show_numbers and not args.no_numbers

    if args.input:
        with open(args.input) as f:
            obj = json.load(f)
    else:
        obj = json.load(sys.stdin)

    draw_matrix(
        obj['data'], obj['row_labels'], obj['col_labels'],
        obj['min'], obj['max'],
        args.title, args.width, args.cell_width, show_numbers,
    )


if __name__ == '__main__':
    main()
