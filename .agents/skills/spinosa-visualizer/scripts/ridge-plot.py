#!/usr/bin/env python3
"""Ridge Plot — stacked overlapping braille silhouette series (Joy Division style).

Cookguide:
  1. Data Intake: gather list of series, each with ordered y-values
  2. Arrange: build JSON with series[{name, values}]
  3. Viz: python3 scripts/ridge-plot.py --input data.json --title "..." --width 52 --height 3
  4. Validate: each series forms a filled silhouette — overlaps are visible

Input JSON: {series: [{name: str, values: [float]}]}
"""

import json
import sys
import argparse

# Braille sub-rows from bottom of cell to top.
# In 2x4 braille: row4(L,R)=dots 7,8(bits 6,7), row3(R,L)=dots 6,3(bits 5,2),
# row2(R,L)=dots 5,2(bits 4,1), row1(R,L)=dots 4,1(bits 3,0)
SUBROW_BITS = [6, 7, 5, 2, 4, 1, 3, 0]


def braille_fill_char(fill_level):
    """Return braille char for 0..8 sub-rows filled from bottom."""
    if fill_level <= 0:
        return ' '
    if fill_level > 8:
        fill_level = 8
    bits = 0
    for i in range(fill_level):
        bits |= 1 << SUBROW_BITS[i]
    return chr(0x2800 + bits)


def render(data, total_width=52, height=3, overlap=0.3):
    series = data.get('series', [])
    S = len(series)

    if S > 10:
        print("Warning: More than 10 series — plot may be cluttered.", file=sys.stderr)

    if S == 0:
        return ''

    # Global maximum across all series
    max_val = max(v for s in series for v in s['values'])
    if max_val == 0:
        max_val = 1

    # Band geometry
    overlap_h = round(overlap * height)
    if overlap_h >= height:
        overlap_h = height - 1
    stride = height - overlap_h
    if stride < 1:
        stride = 1

    H = height + (S - 1) * stride  # total braille rows

    inner_width = total_width - 2

    # Reserve space for labels on the right
    max_label_len = max(len(s.get('name', '')) for s in series) if series else 0
    label_margin = 3  # at least 2 spaces + 1 gap
    braille_cols = inner_width - max_label_len - label_margin
    if braille_cols < 10:
        braille_cols = inner_width
        max_label_len = 0  # don't reserve for labels

    grid = [[' ' for _ in range(braille_cols)] for _ in range(H)]

    # Draw series back-to-front so foreground (lower index) overwrites
    for s_idx in range(S - 1, -1, -1):
        vals = series[s_idx]['values']
        N = len(vals)

        band_start = s_idx * stride
        band_bottom = band_start + height - 1

        for col in range(braille_cols):
            # Linear interpolation for smooth silhouette
            if braille_cols <= 1:
                v = vals[0]
            else:
                frac = col * (N - 1) / (braille_cols - 1)
                idx = int(frac)
                t = frac - idx
                if idx + 1 < N:
                    v = vals[idx] * (1 - t) + vals[idx + 1] * t
                else:
                    v = vals[idx]

            vf = v / max_val

            # Total sub-rows filled from bottom of band
            total_sub = height * 8
            fill_sub = round(vf * total_sub)
            if fill_sub > total_sub:
                fill_sub = total_sub

            for r in range(band_start, band_start + height):
                row_from_bottom = band_bottom - r
                sub_offset = row_from_bottom * 8

                row_fill = fill_sub - sub_offset
                if row_fill <= 0:
                    continue
                if row_fill > 8:
                    row_fill = 8

                char = braille_fill_char(row_fill)
                grid[r][col] = char

    # Build output lines
    lines = []

    # Top border with optional title
    title_text = data.get('title', '')
    if title_text:
        title_fmt = f" {title_text} "
        pad = total_width - 3 - len(title_fmt)
        if pad < 0:
            title_fmt = title_fmt[:total_width - 4] + '… '
            pad = total_width - 3 - len(title_fmt)
        lines.append(f"┌─{title_fmt}{'─' * pad}┐")
    else:
        lines.append(f"┌{'─' * (total_width - 2)}┐")

    # Data rows
    for r in range(H):
        row_chars = [' '] * inner_width
        for c in range(braille_cols):
            row_chars[c] = grid[r][c]

        # Find which series band this row belongs to and if it's the first row
        label = ''
        for s_idx in range(S):
            bs = s_idx * stride
            if r == bs:
                label = '  ' + series[s_idx].get('name', '')
                break

        if label:
            offset = braille_cols + 1
            for i, ch in enumerate(label):
                if offset + i < inner_width:
                    row_chars[offset + i] = ch

        lines.append(f"│{''.join(row_chars)}│")

    x_label = data.get('x_label', '')
    if x_label:
        lines.append(f"└{'─' * inner_width}┘")
        lines.append(f" {x_label} ".ljust(total_width))
    else:
        lines.append(f"└{'─' * inner_width}┘")

    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(
        description='Ridge Plot — stacked overlapping braille silhouette series'
    )
    parser.add_argument('--input', '-i', type=str, help='Input JSON file (default: stdin)')
    parser.add_argument('--title', type=str, default=None, help='Chart title (overrides JSON)')
    parser.add_argument('--x-label', type=str, default=None, help='X-axis label (overrides JSON)')
    parser.add_argument('--width', type=int, default=52, help='Total chart width (default: 52)')
    parser.add_argument('--height', type=int, default=3, help='Braille rows per series (default: 3)')
    parser.add_argument('--overlap', type=float, default=0.3,
                        help='Overlap ratio 0.0-1.0 (default: 0.3)')
    args = parser.parse_args()

    if args.input:
        with open(args.input) as f:
            data = json.load(f)
    else:
        data = json.load(sys.stdin)

    if args.title is not None:
        data['title'] = args.title
    if args.x_label is not None:
        data['x_label'] = args.x_label

    output = render(data, total_width=args.width, height=args.height, overlap=args.overlap)
    print(output)
    print()
    print(f"Ridge plot · {len(data.get('series', []))} series · {args.width} cols"
          f" · {args.height} rows/series · {args.overlap:.0%} overlap.")


if __name__ == '__main__':
    main()
