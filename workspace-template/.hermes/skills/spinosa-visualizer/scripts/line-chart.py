#!/usr/bin/env python3
"""Line Chart — connected braille line chart with axes, grid, multi-series.

Cookguide:
  1. Data Intake: gather time-series or ordered (x,y) points per series
  2. Arrange: build JSON with series[{name, points[{x, y}], color}]
  3. Viz: python3 scripts/line-chart.py --input data.json --title "..." --width 30 --height 10
  4. Validate: lines connect consecutive points — y range covers data

Input JSON: {series: [{name: str, points: [{x: float, y: float}], color: "left"|"right"}]}
"""

import json
import sys
import argparse
import math


def compute_nice_ticks(vmin, vmax, max_count=5):
    if vmin == vmax:
        return [vmin]
    span = vmax - vmin
    rough_step = span / (max_count - 1)
    magnitude = 10 ** math.floor(math.log10(rough_step))
    residual = rough_step / magnitude
    for nice in [1, 2, 2.5, 3, 5, 10]:
        if residual <= nice:
            nice_step = magnitude * nice
            break
    else:
        nice_step = magnitude * 10
    start = math.ceil(vmin / nice_step) * nice_step
    ticks = []
    v = start
    while v <= vmax + nice_step * 0.01:
        ticks.append(v)
        v += nice_step
    while len(ticks) > max_count + 2:
        ticks = ticks[::2]
    return ticks


def render_cells(data, width, height):
    bit_map = [[0, 3], [1, 4], [2, 5]]
    cells = [[0] * width for _ in range(height)]

    if len(series_list) > 2:
        print(f"Warning: truncating {len(series_list)} series to 2 for braille display", file=sys.stderr)
        series_list = series_list[:2]

    all_x = []
    all_y = []
    for s in series_list:
        for p in s["points"]:
            all_x.append(p["x"])
            all_y.append(p["y"])

    if not all_x:
        return cells

    x_min, x_max = min(all_x), max(all_x)
    y_min, y_max = min(all_y), max(all_y)
    if x_min == x_max:
        x_min -= 0.5
        x_max += 0.5
    if y_min == y_max:
        y_min -= 0.5
        y_max += 0.5

    def nx(v):
        return (v - x_min) / (x_max - x_min) * (width - 1)

    def ny(v):
        return (height - 1) - (v - y_min) / (y_max - y_min) * (height - 1)

    def plot(xn, yn, sub_cols):
        bc = int(xn)
        if bc < 0 or bc >= width:
            return
        sc = 0 if (xn - bc) * 2 < 1 else 1
        if sc not in sub_cols:
            sc = sub_cols[0] if sub_cols else 0
        br = int(yn)
        if br < 0 or br >= height:
            return
        sr = min(int((yn - br) * 3), 2)
        cells[br][bc] |= 1 << bit_map[sr][sc]

    def draw_line(p1, p2, sub_cols):
        x1, y1 = p1
        x2, y2 = p2
        if x2 < x1:
            x1, y1, x2, y2 = x2, y2, x1, y1
        dx = x2 - x1
        if dx < 0.001:
            y_lo = int(min(y1, y2))
            y_hi = int(max(y1, y2))
            bc = min(width - 1, max(0, int((x1 + x2) / 2)))
            for y in range(max(0, y_lo), min(height, y_hi + 1)):
                cells[y][bc] |= 0b111111
            return
        step = 0.15
        x = x1
        while x <= x2:
            t = (x - x1) / dx
            y = y1 + t * (y2 - y1)
            bc = int(round(x))
            if bc < 0 or bc >= width:
                x += step
                continue
            # activate all sub-rows for the given sub-col at this x position
            for sc in sub_cols:
                frac_y = y - int(y)
                sr = min(int(frac_y * 3), 2)
                br = int(y)
                if 0 <= br < height:
                    cells[br][bc] |= 1 << bit_map[sr][sc]
                # also activate adjacent sub-row for thicker lines
                if frac_y * 3 - sr > 0.5 and br + 1 < height:
                    cells[br + 1][bc] |= 1 << bit_map[0][sc]
                elif frac_y * 3 - sr < 0.5 and br - 1 >= 0:
                    cells[br - 1][bc] |= 1 << bit_map[2][sc]
            # also activate the opposite sub-col at the same y for thickness
            opp_sc = 1 - sub_cols[0] if len(sub_cols) == 1 else sub_cols[0]
            frac_y = y - int(y)
            sr = min(int(frac_y * 3), 2)
            br = int(y)
            if 0 <= br < height:
                cells[br][bc] |= 1 << bit_map[sr][opp_sc]
            x += step

    for si, series in enumerate(series_list):
        pts = sorted(series["points"], key=lambda p: p["x"])
        color = series.get("color", "").lower()
        if len(series_list) == 1:
            sub_cols = [0, 1]
        elif color == "left":
            sub_cols = [0]
        elif color == "right":
            sub_cols = [1]
        elif si == 0:
            sub_cols = [0]
        else:
            sub_cols = [1]

        norm_pts = [(nx(p["x"]), ny(p["y"])) for p in pts]

        for np_ in norm_pts:
            plot(np_[0], np_[1], sub_cols)

        for i in range(len(norm_pts) - 1):
            draw_line(norm_pts[i], norm_pts[i + 1], sub_cols)

    return cells


def render_chart(data, title="", width=30, height=10, show_grid=False):
    series_list = data.get("series", [])
    if not series_list:
        return "No data."
    if width < 4 or height < 3:
        return "Width must be >= 4 and height >= 3."

    cells = render_cells(data, width, height)

    all_x = []
    all_y = []
    for s in series_list:
        for p in s["points"]:
            all_x.append(p["x"])
            all_y.append(p["y"])

    x_min, x_max = min(all_x), max(all_x)
    y_min, y_max = min(all_y), max(all_y)
    if x_min == x_max:
        x_min -= 0.5
        x_max += 0.5
    if y_min == y_max:
        y_min -= 0.5
        y_max += 0.5

    def nx(v):
        return (v - x_min) / (x_max - x_min) * (width - 1)

    def ny(v):
        return (height - 1) - (v - y_min) / (y_max - y_min) * (height - 1)

    y_ticks = compute_nice_ticks(y_min, y_max)
    y_tick_labels = [str(round(t, 2) if abs(t - round(t)) > 0.001 else int(t)) for t in y_ticks]
    y_tick_rows = [max(0, min(height - 1, int(ny(t) + 0.5))) for t in y_ticks]

    x_ticks = compute_nice_ticks(x_min, x_max)

    y_label_w = max(len(l) for l in y_tick_labels) if y_tick_labels else 1

    total_inner = y_label_w + 2 + width
    total_w = total_inner + 4

    lines = []

    if title:
        avail = total_w - 4
        td = title[:avail - 2] if len(title) > avail - 2 else title
        lhs = "┌─ " + td + " "
        pad = total_w - len(lhs) - 1
        lines.append(lhs + "─" * pad + "┐")
    else:
        lines.append("┌" + "─" * (total_w - 2) + "┐")

    bit_map = [[0, 3], [1, 4], [2, 5]]

    for row in range(height):
        if row in y_tick_rows:
            idx = y_tick_rows.index(row)
            lbl = y_tick_labels[idx]
        else:
            lbl = ""
        label_str = str.rjust(str(lbl), y_label_w)

        braille_chars = []
        for col in range(width):
            code = cells[row][col]
            if show_grid:
                grid_col = col
                if any(abs(nx(t) - col) < 0.3 for t in x_ticks):
                    code |= 0b000111
                    code &= ~0b111000
                if row in y_tick_rows:
                    code |= 0b010010
            braille_chars.append(chr(0x2800 + code))
        braille_str = "".join(braille_chars)

        line = "│ " + label_str + " ┤" + braille_str + " │"
        lines.append(line)

    bottom_axis = "│ " + " " * y_label_w + " └" + "─" * width + " │"
    lines.append(bottom_axis)

    x_cols = [max(0, min(width - 1, int(nx(t) + 0.5))) for t in x_ticks]
    x_buf = [" "] * width
    prev_end = -1
    for val, col in zip(x_ticks, x_cols):
        label = str(val)
        start = col - len(label) // 2
        if start + len(label) > width:
            start = width - len(label)
        if start < 0:
            start = 0
        gap = 1
        if start <= prev_end + gap:
            start = prev_end + gap + 1
        if start + len(label) > width:
            start = width - len(label)
            if start <= prev_end + gap:
                continue
        for i, ch in enumerate(label):
            pos = start + i
            if 0 <= pos < width:
                x_buf[pos] = ch
        prev_end = start + len(label) - 1
    x_str = "".join(x_buf)
    x_line = "│ " + " " * y_label_w + "  " + x_str + " │"
    lines.append(x_line)

    lines.append("└" + "─" * (total_w - 2) + "┘")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Braille line chart")
    parser.add_argument("--input", "-i", help="Input JSON file (default: stdin)")
    parser.add_argument("--title", default="", help="Chart title")
    parser.add_argument("--width", type=int, default=30, help="Braille columns")
    parser.add_argument("--height", type=int, default=10, help="Braille rows")
    parser.add_argument("--grid", action="store_true", help="Show grid lines")
    args = parser.parse_args()

    try:
        if args.input:
            with open(args.input) as f:
                data = json.load(f)
        else:
            data = json.load(sys.stdin)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error loading input: {e}", file=sys.stderr)
        sys.exit(1)

    chart = render_chart(data, args.title, args.width, args.height, args.grid)
    print(chart)


if __name__ == "__main__":
    main()
