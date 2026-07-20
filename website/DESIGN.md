---
name: Spinosa
description: One-page landing for the Spinosa CLI installer
colors:
  olive-grove: '#2b3322'
  pure-white: '#ffffff'
  washed-clay: '#f4f4f4'
  warm-limestone: '#e9e9e9'
  basalt: '#222222'
  sun-cured-terracotta: '#b85a3a'
typography:
  display:
    fontFamily: 'Inter Tight, system-ui, sans-serif'
    fontSize: 'clamp(0.75rem, 2vw, 0.875rem)'
    fontWeight: 400
    lineHeight: 1
    letterSpacing: '0.08em'
  body:
    fontFamily: 'Inter Tight, system-ui, sans-serif'
    fontSize: 'clamp(0.875rem, 3vw, 1.5rem)'
    fontWeight: 400
    lineHeight: 1.2
  label:
    fontFamily: 'Inter Tight, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 500
    letterSpacing: '0.05em'
    textTransform: 'uppercase'
rounded:
  code-box: '6px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
  xl: '48px'
components:
  code-block:
    backgroundColor: '{colors.washed-clay}'
    textColor: '{colors.basalt}'
    rounded: '{rounded.code-box}'
    padding: '13px 16px'
  copy-button:
    backgroundColor: '{colors.washed-clay}'
    textColor: '{colors.basalt}'
    rounded: '{rounded.code-box}'
    size: '55px'
  copy-button-hover:
    backgroundColor: '{colors.warm-limestone}'
    textColor: '{colors.olive-grove}'
    rounded: '{rounded.code-box}'
    size: '55px'
---

# Design System: Spinosa

## 1. Overview

**Creative North Star: "The Sun-Cured Coast"**

Single-viewport landing that frames a one-line install command inside Mediterranean light. The page is a still from a coastal afternoon — warm, quiet, and grounded. Everything serves the install command.

The background photograph carries the entire emotional weight. Color, typography, and layout exist to frame it without competing. The result is a landing that communicates more through what it leaves out than what it includes.

**Key Characteristics:**

- Single-viewport commitment. No scroll, no navigation, no secondary actions.
- Photograph-led. The coastal scene IS the design.
- Type as structure. Inter Tight at minimal sizes organizes the viewport.
- One interaction: copy the command. Everything else is static.

## 2. Colors: The Coastal Palette

A restrained palette anchored by a deep olive green, with a warm terracotta accent that echoes the Mediterranean image. The surface stays pure white — the warmth lives in the photograph and the accent, not the background.

### Primary

- **Olive Grove** (`#2b3322` / `oklch(0.350 0.075 110.0)`): Deep sun-cured olive. Used as the brand anchor — appears in interactive hover states and the logo. Not an everyday surface color; its rarity is the point.

### Neutral

- **Pure White** (`#ffffff` / `oklch(1 0 0)`): Body background. The coastal Mediterranean image against pure white is the defining visual move.
- **Washed Clay** (`#f4f4f4` / `oklch(0.965 0.003 110)`): Code block and button surface. A trace of olive hue, not generic gray.
- **Warm Limestone** (`#e9e9e9` / `oklch(0.915 0.003 110)`): Borders and dividers.
- **Basalt** (`#222222` / `oklch(0.15 0.008 110)`): Body text. Near-black with a subtle olive undertone so it doesn't read as cold pure-black against the warm image.
- **Stone** (`oklch(0.55 0.008 110)`): Muted/secondary text. Same olive-tinted gray at reduced contrast.

### Accent

- **Sun-Cured Terracotta** (`#b85a3a` / `oklch(0.55 0.12 35)`): Warm earth-red that echoes the sun-cured soil and rooftops in the coastal image. Used as a copy-success state (the checkmark after clicking the copy button).

### Named Rules

**The Rarity Rule.** The Olive Grove primary is used on ≤5% of any given viewport. Its scarcity is the point — when it appears (hover state on the copy button), it carries weight.

## 3. Typography

**Display Font:** Inter Tight (with system-ui/sans-serif fallback)
**Body Font:** Inter Tight (with system-ui/sans-serif fallback)
**Label/Mono Font:** Inter Tight (with system-ui/sans-serif fallback)

**Character:** A single-family approach with deliberate contrast between weight and size rather than between faces. Inter Tight at display sizes reads as condensed and precise; at body sizes it's neutral and legible. The single family means zero pairing decisions, which reinforces the page's restraint.

### Hierarchy

- **Display** (Regular 400, `clamp(0.75rem, 2vw, 0.875rem)`, 1.0 line-height, 0.08em letter-spacing, uppercase): The "SPINOSA" wordmark at viewport top. All-caps is deliberate — a small architectural label, not a headline.
- **Body** (Regular 400, `clamp(0.875rem, 3vw, 1.5rem)`, 1.2 line-height): The install command text. Sized to be comfortably readable at any viewport while keeping the command on one line.
- **Label** (Medium 500, `0.75rem`, 0.05em letter-spacing, uppercase): Reserved for — there are no secondary labels on this page. Defined for consistency if labels are introduced later.

## 4. Elevation

Flat by default. The page uses tonal layering (Washed Clay surface against Pure White background) rather than shadows to distinguish the code block from the background. The photograph provides the only depth.

## 5. Components

### Code Block

- **Shape:** Gently rounded corners (6px radius)
- **Background:** Washed Clay
- **Border:** Warm Limestone, 1px solid
- **Text:** Basalt, Inter Tight body size
- **Internal Padding:** 13px vertical, 16px horizontal
- **Overflow:** Horizontal scroll on mobile (single-line preservation)

### Copy Button

- **Shape:** Square with gently rounded corners (6px radius)
- **Size:** 55×55px
- **Background:** Washed Clay at rest; Olive Grove on hover
- **Icon:** 24×24px, Basalt at rest; Pure White on hover. After copy: Sun-Cured Terracotta checkmark
- **Border:** Warm Limestone, 1px solid, matching code block
- **States:**
  - Default: clipboard icon, Basalt on Washed Clay
  - Hover/Focus: Olive Grove background, Pure White icon
  - Copied: green checkmark for 2 seconds, then resets

## 6. Do's and Don'ts

### Do:

- **Do** let the background photograph be the hero. Color, type, and layout frame it.
- **Do** use pure white as the default surface. Restraint is the brand.
- **Do** keep the command on one line with horizontal scroll on mobile.
- **Do** use `prefers-reduced-motion` to disable all animations.
- **Do** provide visible `:focus-visible` rings on the interactive copy button.

### Don't:

- **Don't** add navigation, footer, or secondary CTAs. One page, one action.
- **Don't** use shadows or elevation. The page is flat; depth comes from the image.
- **Don't** use gradient text, glassmorphism, or side-stripe borders. Absolute bans.
- **Don't** add gradient CTAs, hero metrics, testimonial rows, or card grids — these are the generic SaaS landing page patterns this brand explicitly rejects.
- **Don't** use a warm-tinted background. Pure white or nothing. Warmth is the photograph's job.
- **Don't** add section headers, numbered markers, or tiny uppercase eyebrow labels above sections.
- **Don't** use monospace as a "developer tool" shorthand. Inter Tight is precise and deliberate.
