# DAEMON — Brand Guidelines

Official brand identity reference for the DAEMON agent workbench. Follow these rules across all marketing, UI, documentation, and community touchpoints.

---

## 1. Color Palette

### Core Backgrounds (Elevation Scale)

Dark-first. Each step lifts a surface closer to the user.

| Token  | Hex       | Usage                              |
|--------|-----------|-------------------------------------|
| `--bg` | `#0a0a0a` | Workspace pit — deepest layer       |
| `--s1` | `#141414` | Sidebars, titlebar, cards           |
| `--s2` | `#1a1a1a` | Inputs, secondary surfaces          |
| `--s3` | `#222222` | Hover states                        |
| `--s4` | `#2a2a2a` | Active / pressed states             |
| `--s5` | `#333333` | Borders                             |
| `--s6` | `#3a3a3a` | Strong borders / dividers           |

### Text Scale

All values are WCAG AA compliant against `--bg` (#0a0a0a).

| Token  | Hex       | Contrast | Usage                    |
|--------|-----------|----------|--------------------------|
| `--t1` | `#f0f0f0` | 15.5:1   | Primary text             |
| `--t2` | `#a0a0a0` | 7.5:1    | Secondary text           |
| `--t3` | `#888888` | 6.1:1    | Tertiary / muted labels  |
| `--t4` | `#666666` | 4.6:1    | Disabled / placeholder   |

### Accent Colors

Each accent has three states: **base**, **dim** (hover/pressed), and **glow** (ambient background).

| Name   | Base      | Dim       | Glow (15% alpha)            | Semantic Role      |
|--------|-----------|-----------|-----------------------------|--------------------|
| Green  | `#3ecf8e` | `#2a9d6a` | `rgba(62, 207, 142, 0.15)`  | Primary accent, success, focus |
| Amber  | `#f0b429` | `#c99a22` | `rgba(240, 180, 41, 0.15)`  | Warnings           |
| Red    | `#ef5350` | `#c94442` | `rgba(239, 83, 80, 0.15)`   | Errors, danger     |
| Blue   | `#60a5fa` | `#4a8ad4` | `rgba(96, 165, 250, 0.15)`  | Info, links        |

### Color Rules

- **Green is the brand color.** It is the only accent used for focus rings, primary CTAs, active indicators, and brand marks.
- **Never use raw hex in components.** Always reference CSS custom properties from `tokens.css`.
- **No neon.** Glows are ambient (4-6% opacity), not flashy. Think "emission", not "laser".
- **Dark mode only.** DAEMON does not have a light theme. All palette choices assume dark backgrounds.
- **Selection color:** `rgba(74, 140, 98, 0.3)` — a muted green tint, not a bright highlight.

### Premium Surface Tokens

| Token                        | Value                                                           | Usage                      |
|------------------------------|------------------------------------------------------------------|----------------------------|
| `--surface-gradient-subtle`  | `linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent)` | Felt-not-seen panel tops   |
| `--border-glass`             | `rgba(255, 255, 255, 0.04)`                                     | Frosted glass edges        |
| `--glass-bg`                 | `rgba(20, 20, 20, 0.85)`                                        | Frosted glass background   |
| `--glass-blur`               | `blur(12px) saturate(130%)`                                      | Backdrop filter             |

---

## 2. Typography

### Font Families

| Purpose       | Font                | Fallback Stack                                        |
|---------------|---------------------|-------------------------------------------------------|
| **UI**        | Plus Jakarta Sans   | -apple-system, BlinkMacSystemFont, sans-serif         |
| **Code**      | JetBrains Mono      | Fira Code, Cascadia Code, monospace                   |

Both fonts are self-hosted as `.woff2` in `/public/fonts/`. No external font requests — DAEMON runs fully offline.

### UI Font Weights

| Weight | Name       | Usage                                    |
|--------|------------|------------------------------------------|
| 400    | Regular    | Body text, descriptions, inputs          |
| 500    | Medium     | Labels, list items, secondary emphasis   |
| 600    | SemiBold   | Panel headers, section titles            |
| 700    | Bold       | Primary headings, strong emphasis (rare) |

### Code Font Weights

| Weight | Name    | Usage                    |
|--------|---------|--------------------------|
| 400    | Regular | Editor text, terminal    |
| 500    | Medium  | Active line highlights   |
| 700    | Bold    | Search matches, keywords |

### Type Scale

| Token         | Size  | Usage                         |
|---------------|-------|-------------------------------|
| `--font-xs`   | 9px   | Badges, chip labels           |
| `--font-sm`   | 10px  | Section headers, captions     |
| `--font-base` | 11px  | Body text, inputs             |
| `--font-md`   | 12px  | List items, labels            |
| `--font-lg`   | 14px  | Panel sub-titles              |
| `--font-xl`   | 16px  | Panel titles                  |

### Typography Rules

- **Base font size is 11px.** This is an IDE — density matters. Don't inflate.
- **Line height: 1.4** across all UI text.
- **Panel headers:** 11px, SemiBold (600), uppercase, 0.5px letter-spacing, `--t2` color.
- **Anti-aliasing:** Always enable `-webkit-font-smoothing: antialiased`.
- **No font-size larger than 16px** anywhere in the application chrome. Marketing and external assets may use larger sizes.
- **Code and UI fonts never mix** within the same component. If it shows code, it uses JetBrains Mono exclusively.

---

## 3. Logo

### Mark Description

The DAEMON logo consists of two squircle (superellipse) shapes arranged diagonally — a larger form at top-left and a smaller form at bottom-right. The top-left shape has a rounded top-right corner (72px radius) with straight left and bottom edges. The bottom-right shape mirrors this with a rounded bottom-left corner. Together they form a stylized "D" that evokes layered interfaces, stacked panels, and emergent intelligence.

The logotype pairs the mark with "DAEMON" set in **Plus Jakarta Sans Bold** (700), converted to SVG paths for zero font dependency.

### Source Files

Figma source: `figma.com/design/eCo9Lb32Xtz1fj0QulH85N/Logo-Vector`

### Exported Assets

#### SVG (Vector Source)

| File                                              | Description                                |
|---------------------------------------------------|--------------------------------------------|
| `resources/brand/svg/mark-primary.svg`            | White mark on `#0C0C0C` background         |
| `resources/brand/svg/mark-white-transparent.svg`  | White mark on transparent — for dark BGs   |
| `resources/brand/svg/mark-dark-transparent.svg`   | `#0C0C0C` mark on transparent — for light BGs |
| `resources/brand/svg/logotype-white.svg`          | Mark + "DAEMON" logotype, white            |
| `resources/brand/svg/logotype-dark.svg`           | Mark + "DAEMON" logotype, `#0C0C0C`       |
| `resources/brand/svg/logotype-green.svg`          | Mark + "DAEMON" logotype, `#3ECF8E`       |

#### PNG (Raster — Full Size Ladder)

Each variant includes: 16, 32, 64, 128, 256, 512, 1024px.

| Directory                                   | Variant                        | Usage                          |
|---------------------------------------------|--------------------------------|--------------------------------|
| `resources/brand/png/primary/`              | White mark on dark background  | App store, social, marketing   |
| `resources/brand/png/white-transparent/`    | White mark, transparent BG     | Dark UI surfaces, overlays     |
| `resources/brand/png/dark-transparent/`     | Dark mark, transparent BG      | Light surfaces, print, docs    |

Files follow the naming pattern: `daemon-mark-{size}.png`

#### App Icons (Derived)

| File                         | Source                            | Usage                              |
|------------------------------|-----------------------------------|------------------------------------|
| `resources/icon.ico`         | Generated from primary 256px      | Windows taskbar, title bar         |
| `resources/icon.png`         | Primary 256px                     | macOS dock, Linux desktop          |
| `public/favicon.ico`         | Generated from primary            | Embedded browser, web contexts     |
| `public/daemon-icon-48.png`  | Primary 64px (closest available)  | Notifications, small placements    |

### Logo Colors

| Context           | Mark Color   | Background   |
|-------------------|-------------|--------------|
| Primary (on dark) | `#FFFFFF`   | `#0a0a0a`    |
| Accent            | `#3ecf8e`   | `#0a0a0a`    |
| Reversed (light)  | `#0C0C0C`   | `#f0f0f0`    |
| Monochrome        | `#FFFFFF`   | Transparent  |

### Logo Usage Rules

**Do:**
- Use the logo at minimum 24px for icon contexts, 48px for standalone display.
- Maintain equal clear space around the mark — minimum padding equal to 25% of the mark's width on all sides.
- Use the monochrome white version on busy or photographic backgrounds.
- Use the logotype SVGs (`logotype-white/dark/green.svg`) when pairing the mark with the name.

**Don't:**
- Don't add drop shadows, outer glows, or gradients to the logo.
- Don't rotate, stretch, skew, or distort the mark.
- Don't place the logo on backgrounds lighter than `#333333` without switching to the reversed version.
- Don't outline or stroke the mark — it is always a solid fill.
- Don't recreate the mark in a different typeface or with rounded rectangles — the squircle geometry is intentional.
- Don't add emoji or icons adjacent to the logo.
- Don't animate the logo in UI chrome. Motion is reserved for marketing contexts only.
- Don't manually type "DAEMON" next to the mark — always use the logotype SVG lockup.
- Don't mix colors within the lockup (e.g. green mark + white text).

### Logotype

The logotype is a **single lockup** combining the mark + "DAEMON" in Plus Jakarta Sans Bold (700), all converted to SVG paths.

| Variant | File | Usage |
|---------|------|-------|
| White | `logotype-white.svg` | Dark backgrounds (primary) |
| Dark | `logotype-dark.svg` | Light backgrounds |
| Green | `logotype-green.svg` | Brand accent contexts |

- Mark height is **115% of the text cap height** for visual balance
- Gap between mark and text is **40% of the font size**
- All elements share the same fill color — the lockup is always monochrome
- Never reposition the mark relative to the text — use the SVG as-is

---

## 4. Spacing & Layout

### Spacing Scale

| Token        | Value | Usage                      |
|--------------|-------|----------------------------|
| `--space-xs` | 4px   | Tight gaps, icon padding   |
| `--space-sm` | 8px   | Inline spacing, small gaps |
| `--space-md` | 12px  | Section padding, card gaps |
| `--space-lg` | 16px  | Panel padding              |
| `--space-xl` | 24px  | Major sections             |

### Border Radius

| Token          | Value | Usage                   |
|----------------|-------|-------------------------|
| `--radius-sm`  | 3px   | Buttons, inputs, chips  |
| `--radius-md`  | 4px   | Cards, panels           |
| `--radius-lg`  | 6px   | Modals, dropdowns       |

### Key Dimensions

| Element       | Size   |
|---------------|--------|
| Title bar     | 38px   |
| Sidebar       | 48px   |
| Left panel    | 210px  |
| Right panel   | 262px  |
| Status bar    | 22px   |

---

## 5. Interaction & Motion

### Transitions

| Token                | Duration | Usage                       |
|----------------------|----------|-----------------------------|
| `--transition-fast`  | 0.1s     | Hover states, toggles       |
| `--transition-normal`| 0.15s    | Panel transitions, fades    |
| `--transition-slow`  | 0.25s    | Modals, overlays            |

### Easing

All transitions use `ease`. No bounce, no spring, no overshoot. Quiet and precise.

### Interactive States

| State    | Visual Treatment                              |
|----------|-----------------------------------------------|
| Hover    | `rgba(255, 255, 255, 0.04)` overlay           |
| Active   | `rgba(255, 255, 255, 0.08)` overlay + `scale(0.98)` |
| Focus    | 2px `--green` outline, 2px offset             |
| Disabled | `--t4` text color, no pointer events          |

### Status Indicators

- Use **5px colored dots** for status (online, warning, error). Never use emoji.
- Dot colors map to the accent palette: green = success, amber = warning, red = error, blue = info.

---

## 6. Shadows & Depth

| Token             | Value                                             | Usage             |
|-------------------|----------------------------------------------------|-------------------|
| `--shadow-lifted` | `0 2px 8px rgba(0,0,0,0.3), inset highlight`      | Cards, panels     |
| `--shadow-float`  | `0 8px 32px rgba(0,0,0,0.4), inset highlight`     | Dropdowns, popups |
| `--shadow-modal`  | `0 16px 48px rgba(0,0,0,0.5), inset highlight`    | Modals, dialogs   |

Each shadow includes a subtle `rgba(255,255,255,0.03-0.04)` inset highlight for dimensionality.

---

## 7. Voice & Tone

DAEMON's brand voice matches its visual identity: **precise, minimal, technical**.

- **Short.** Labels are 1-2 words. Descriptions are 1 sentence. Error messages state what happened and what to do.
- **Direct.** "Save failed" not "Oops! We couldn't save your file." No hedging, no apologies.
- **Technical.** Users are developers. Don't simplify terminology. Say "IPC handler" not "communication layer".
- **No emoji in product UI.** Marketing and social media may use them sparingly.
- **Product name:** Always "DAEMON" in all-caps when used as a brand name. Lowercase "daemon" is acceptable in code, CLI references, and technical documentation.

---

## Source of Truth

All color, spacing, and typography values live in `styles/tokens.css`. This document describes how to apply them — the CSS file is the canonical source. If this document and `tokens.css` ever conflict, `tokens.css` wins.
