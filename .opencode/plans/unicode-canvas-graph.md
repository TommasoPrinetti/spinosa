# Unicode Canvas Rendering Plan

## Goal

Replace the RGBA raster + compositing pipeline with a direct Unicode character grid.
Each terminal cell gets exactly one visually optimal Unicode glyph, chosen from a
curated set based on what content occupies that cell's region.

This mirrors how **UnicodePlots.jl** (canvas abstraction + pixel! + LUT decode) and
**chartli** (per-cell block selection for bars, braille scatterplots) work.

---

## Architecture

### Before (current)

```
Scene → paintGraphScene() → RGBA raster (W×S × H×S) → compositeHalfBlock() → terminal
                           (S² sub-pixels/cell, full RGBA)  (avg top/bottom, ▀ char)
```

### After

```
Scene → paintGraphScene() → Bitmask grid (W×pw × H×ph) → compositeCanvas() → terminal
                           (pw·ph sub-pixels/cell, binary)  (LUT decode → char)
```

The **scene painter** is unchanged — still receives a `GraphRaster`, still calls
`blendPixel()` per primitive. What changes is what `GraphRaster` stores internally
and how compositing works.

---

### Canvas Family

```
GraphRaster (abstract — strategy pattern via `compositeCanvas`)
  |
  +-- SolidCanvas    pw=1, ph=1    → 1×1  sub-pixel per cell, full block █
  |                                   Storage: None (pixel! writes cell color directly)
  |                                   Composite: setCell(█, color, color)
  |
  +-- BarCanvas      pw=1, ph=8    → 1×8  sub-pixels per cell, 8 vertical levels
  |                                   Storage: Uint8 0-8 level per cell
  |                                   Char: " ▁▂▃▄▅▆▇█"[level]
  |                                   (chartli's unicode bar technique)
  |
  +-- QuadCanvas     pw=2, ph=2    → 2×2  sub-pixels per cell, 4 quadrants
  |                                   Storage: Uint4 bitmask per cell
  |                                   Char: lookup[bitmask] → ▀▄▌▐▘▝▖▗▙▛▜▟▚▞█
  |                                   (UnicodePlots' BlockCanvas)
  |
  +-- BrailleCanvas  pw=2, ph=4    → 2×4  sub-pixels per cell, 8 braille dots
  |                                   Storage: Uint8 bitmask per cell
  |                                   Char: U+2800 + bitmask
  |                                   (UnicodePlots' BrailleCanvas, chartli's braille)
  |
  +-- DensityCanvas  pw=1, ph=1    → 1×1, counter per cell
                                     Storage: hit count per cell
                                     Char: " ░▒▓█" depending on density
                                     (UnicodePlots' DensityCanvas)
```

Each canvas stores:
- `pixelWidth`, `pixelHeight` — total sub-pixel resolution
- `grid` — bitmask/value array sized `pixelWidth × pixelHeight` (or `cellsW × cellsH` for non-bitmask canvases)
- `fgColors`, `bgColors` — per-cell colors (`RGBA[][]` or flat arrays)
- `hits` — the existing `GraphHitMap` (unchanged)

---

### Rendering Pipeline

```
paintGraphScene(raster, scene, palette, viewport)
  │
  ▼
For each primitive (node, edge, bar, area, label):
  worldToRaster(point, viewport, pixelW, pixelH) → pixel coords
  paint primitive into pixel grid via:
    blendPixel(x, y, color, alpha, coverage, hitIndex)
      → canvas.pixel!(x, y, color)
      → OR bitmask into grid at (x, y)   [for bitmask canvases]
      → or store color                   [for solid canvas]
      → or increment counter             [for density canvas]
      → record hit if hitIndex >= 0
  │
  ▼
compositeCanvas()                            [was compositeHalfBlock/compositeDirect]
  For each cell (cx, cy):
    read pixel block [cx*pw .. cx*pw+pw-1, cy*ph .. cy*ph+ph-1]
    compute fg, bg colors from pixel colors in block
    compute grid value from sub-pixel data
    lookup Unicode char
    frameBuffer.setCell(cx, cy, char, fg, bg)
```

---

### Which Canvas for Which Scene

| Scene mode | Canvas | Why |
|-----------|--------|-----|
| **files** (circular clusters) | **BrailleCanvas** | Dense dots for file markers; 2×4 per cell shows fine cluster detail |
| **flow** (sankey) | **BrailleCanvas** | Ribbon edges need high density to show width variation smoothly |
| **activity** (bar chart) | **BarCanvas** | 8 vertical levels per cell gives smooth bar tops; horizontal bars look natural |

Default for any mode: **BrailleCanvas** (highest density, works on Apple Terminal).

---

### DDA Line Rasterization

Replace the current per-pixel line painting with a DDA (Digital Differential
Analyzer), mirroring UnicodePlots.jl's `lines!()`:

```
paintLine(from, to, width, color, opacity, hit):
  dx = to.x - from.x
  dy = to.y - from.y
  steps = max(ceil(|dx|), ceil(|dy|))
  for i = 0 to steps:
    t = i / steps
    px = from.x + dx * t
    py = from.y + dy * t
    // thickness: paint multiple perpendicular pixels
    for each perpendicular offset within radius:
      pixel!(px + perp_x, py + perp_y, color)
```

This produces continuous lines without gaps, especially for diagonal edges.

---

### Color Logic Per Cell (all canvases)

For bitmask canvases (Braille, Quad), each cell has up to `pw·ph` sub-pixels,
each either "set" (content present) or "clear" (background).

After all primitives are painted:
- **fg** = average RGBA of all SET sub-pixels in this cell
- **bg** = average RGBA of all CLEAR sub-pixels
- If all sub-pixels are set → `█` with fg=bg=averaged color (solid)
- If none are set → space `" "` (no content)
- This is mathematically equivalent to what our current `compositeDirect` does,
  but at sub-cell resolution instead of per-cell.

---

### Concrete Character Tables

#### QuadCanvas (2×2 quadrants)

```
bits: TL(0x8) TR(0x4) BL(0x2) BR(0x1)

0b0000 → " "    0b0001 → ▗    0b0010 → ▖    0b0011 → ▄
0b0100 → ▝      0b0101 → ▐    0b0110 → ▞    0b0111 → ▟
0b1000 → ▘      0b1001 → ▚    0b1010 → ▌    0b1011 → ▙
0b1100 → ▀      0b1101 → ▜    0b1110 → ▛    0b1111 → █
```

#### BarCanvas (8 vertical levels)

```
level 0 → " "  (space)
level 1 → ▁     level 2 → ▂     level 3 → ▃     level 4 → ▄
level 5 → ▅     level 6 → ▆     level 7 → ▇     level 8 → █
```

#### BrailleCanvas (2×4 dots)

```
bits per column:
  col0: dot_top(0x01) dot_mid1(0x02) dot_mid2(0x04) dot_bot(0x40)
  col1: dot_top(0x08) dot_mid1(0x10) dot_mid2(0x20) dot_bot(0x80)

char = String.fromCodePoint(0x2800 + bitmask)
```

---

### Changes to GraphRaster

The `GraphRaster` class is currently:

```ts
class GraphRaster {
  data = new Uint8Array(width * height * 4)  // RGBA
  width, height  // = cellsW * GRAPH_RASTER_SCALE
  hits = new GraphHitMap()
  resize(w, h)  // w, h = cell count
  clear(color)
  paintRect(...)   // all call blendPixel(x, y, ...)
  paintEllipse(...)
  paintLine(...)
  paintCubic(...)
  paintPolygon(...)
  paintPolyline(...)
}
```

New structure:

```ts
type CanvasKind = "solid" | "quad" | "braille" | "bar" | "density"

class GraphRaster {
  kind: CanvasKind
  pw: number       // sub-pixels per cell (width)
  ph: number       // sub-pixels per cell (height)
  cellsW: number
  cellsH: number
  grid: Uint8Array   // per-cell bitmask or level
  fgGrid: Uint8Array // per-cell fg color (RGBA packed)
  bgGrid: Uint8Array // per-cell bg color (RGBA packed)
  hits = new GraphHitMap()

  pixelW: number   // total sub-pixel width = cellsW * pw
  pixelH: number   // total sub-pixel height = cellsH * ph

  resize(w, h)     // w, h = cell count
  clear(color)     // resets grid to 0, bgGrid to panel color
  pixel!(x, y, color, hitIndex)  // primitive → replace blendPixel

  // composite to frameBuffer
  composite(buffer: OptimizedBuffer)
}
```

The `pixel!` method:

```ts
pixel!(px: number, py: number, color: RGBA, hitIndex: number) {
  const cx = Math.floor(px / this.pw)
  const cy = Math.floor(py / this.ph)
  if (cx < 0 || cy < 0 || cx >= this.cellsW || cy >= this.cellsH) return

  const cellIdx = cy * this.cellsW + cx
  const dx = Math.floor(px % this.pw)   // sub-cell x
  const dy = Math.floor(py % this.ph)   // sub-cell y

  // OR bitmask into grid
  this.grid[cellIdx] |= BITMASKS[dy][dx]

  // Blend color into fg accumulator (simple average)
  // (or store the last color, or use a color per sub-pixel)
  // For simplicity: running sum + count per cell for fg/bg separately
  // But that'd need 2 accumulators per cell. Alternative:
  // Store all sub-pixel colors? Too much memory.
  // Simplest: store last painted color as fg, keep bg as panel.
  // Better: store accumulated RGBA per cell for both fg and bg.
  this._accumulateFG(cellIdx, color)
}
```

For the color accumulation, the simplest approach that works:
- For each cell, maintain per-sub-pixel color. At `pw·ph` = up to 8 sub-pixels
  (braille), storing 8 RGBA values per cell is 32 bytes per cell — reasonable.
  For 136×40 cells = 5440 cells × 32 bytes = 170 KB.

Actually, the simplest approach: **don't accumulate colors per sub-pixel**. Instead:
- The `pixel!` call already receives the blended color from the scene painter
- Just mark the sub-pixel as "set" in the bitmask
- For color: keep the **last color painted** for each sub-pixel (or the average)

For the prototype: just track whether each sub-pixel is set. Composite reads
the per-cell colors from a separate array indexed by cell (not by sub-pixel).

---

### Scene Painter Changes

The scene painter's `blendPixel` currently computes `coverage × opacity × alpha`
and blends into the RGBA raster. This becomes:

```ts
// For bitmask canvases:
if (alpha > threshold) {
  raster.pixel!(px, py, blendedColor, hitIndex)
}
```

The analytical coverage computation (for anti-aliasing) becomes a **threshold
test** — if coverage exceeds 0.5, the sub-pixel is set. This gives hard edges
at sub-pixel resolution, which is exactly what braille/block rendering expects.

---

### Edge Cases & Risks

| Issue | Solution |
|-------|----------|
| **Color accuracy**: Binary sub-pixels can only show 2 colors per cell | For flat-colored content (file dots, bars, nodes), all sub-pixels in a cell get the same color → fg=bg=solid. Only edges (where content meets background) show 2 colors. This is fine — edges are where you want contrast. |
| **Thin lines**: A 1-sub-pixel-wide line is barely visible | Scale line width to at least 1 pixel. At braille resolution (2×4), a "thin" line = 1 sub-pixel wide = visible as a braille dot. |
| **Hit testing**: pixel! records hits per cell, same as before | Unchanged. |
| **Performance**: No RGBA blending, no averaging loops | Much faster. pixel! is a bitmask OR + color store. Composite is a LUT lookup + setCell. |
| **BarCanvas vs BrailleCanvas**: Different canvases for different modes | Dispatch in buildGraphScene based on mode. File clusters → BrailleCanvas. Activity bars → BarCanvas. |

---

### Implementation Order

1. **Define `CanvasKind` and `Bitmask` lookup tables** in `visualizer-graph-render.ts`
2. **Refactor `GraphRaster`** to support both RGBA mode (current) and bitmask mode (new)
   - Keep `GRAPH_RASTER_SCALE` for size calculation
   - Add `pw`/`ph` (sub-pixels per cell) instead of square scale
   - Add `grid`, `fgGrid`, `bgGrid` arrays
3. **Implement `pixel!`** — the core primitive for bitmask canvases
4. **Implement DDA line rasterization** in `paintLine` and `paintCubic`
5. **Implement `composite()`** per canvas type:
   - `CompositeBraille` → braille LUT
   - `CompositeQuad` → quadrant LUT
   - `CompositeBar` → 8-vertical-level LUT
6. **Update `paintGraphScene`** to use `pixel!` with coverage threshold
7. **Wire canvas per mode** in `buildGraphScene`:
   - files → BrailleCanvas
   - flow → BrailleCanvas  
   - activity → BarCanvas
8. **Update tests** for new canvas sizes and content
