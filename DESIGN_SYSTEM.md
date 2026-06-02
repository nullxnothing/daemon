# DAEMON Design System

The single source of truth for how DAEMON looks, feels, and behaves. If you are
building or changing UI, read this first. The goal is **one app** — every panel
should feel like it was built by the same hand on the same day.

> **Bar:** shipped, not pitched. The 2026 UI is a compact agent workbench:
> sharp panes, hairline structure, textured workspace void, and green used only
> when something is primary, live, ready, or successful.

---

## Principles

1. **Tokens, never literals.** Every color, size, radius, shadow, duration, and
   easing comes from `styles/tokens.css`. No raw hex, no `font-size: 14px`, no
   `border-radius: 6px` in panels. `pnpm run lint:styles` enforces this and only
   ratchets down.
2. **Green is reserved.** `--accent-green` is `#3ecf8e` and means primary /
   healthy / live / ready / success. Do not use green for decoration. Use `--amber` (warning), `--red`
   (error/destructive), `--blue` (info), `--solana` purple (Solana-affinity panels only).
3. **Sharp containers, small controls.** Panels and cards are square. Controls and
   floating menus may use only small 3-6px radii. Avoid pill buttons unless the
   component is semantically a badge, chip, or dot.
4. **One header, one card, one state view.** Use the shared `PanelHeader`,
   `Card`/`Surface`, and `StateView` primitives. Do not hand-roll panel chrome.
5. **Every async surface has four states.** loading → error → empty → ready, via
   `StateView`. No blank panels, no content that pops in with no intermediate state.
6. **Motion is functional.** Transitions clarify state change (panel switch, drawer,
   toast). Use `--dur-*` + `--ease-*` tokens only. Always honor `prefers-reduced-motion`
   (tokens collapse durations automatically).
7. **Keyboard-first.** Every action reachable from the command palette
   (`Ctrl+Shift+P`); every interactive element has a visible `:focus-visible` ring;
   shortcuts are surfaced in the keyboard overlay.
8. **Density is intentional.** Tabular data uses the `--row-h-*` scale. Align to the
   spacing grid — no off-by-4px paddings.

---

## Tokens

Defined in [`styles/tokens.css`](styles/tokens.css). Reach for the **semantic** token,
not the raw scale value.

Dark is the default theme. Light mode is activated by `data-theme="light"` on the
document root and must be verified whenever global tokens or shared primitives change.

### Surfaces (dark → light)
| Token | Use |
|-------|-----|
| `--surface-flat` | workspace background |
| `--surface-sunken` (`--bg-well`) | wells, inset areas, code surfaces |
| `--surface-raised` (`--bg-card`) | cards, default panel content |
| `--surface-floating` | hovered cards, raised controls |
| `--surface-overlay` / `--glass-bg` | popovers, command palette, dropdowns |
| `--surface-panel` | panel container |

Raw scale `--s1…--s6` exists for compatibility; **prefer the semantic surface tokens.**

### Text ladder
`--t1` primary · `--t2` secondary · `--t3` muted · `--t4` faint · `--text-disabled`.

### Accents
`--green` / `--amber` / `--red` / `--blue` / `--solana`, each with `-dim` and `-glow`
variants. Semantic aliases: `--success`, `--warning`, `--error`, `--info`, `--accent`.
Text on a saturated fill: `--on-accent`.

### Borders & focus
Borders: `--border` (soft) · `--border-hover` · `--border-strong`.
Focus rings (pick by intent): `--focus-ring` (green, inputs) · `--focus-ring-neutral`
(buttons) · `--focus-ring-red` (destructive) · `--focus-ring-blue` (info).

### Spacing
`--space-xs` 4 · `--space-sm` 8 · `--space-md` 12 · `--space-lg` 16 · `--space-xl` 24
· `--space-2xl` 32 · `--space-3xl` 40 · `--space-4xl` 48. Panel padding: `--panel-pad-x/y`.

### Radius
`--radius-sm` 3 · `--radius-md` 4 · `--radius-lg` 6 · `--radius-xl` 6 ·
`--radius-pill` 999. Semantic: `--radius-card` is square (`0px`),
`--radius-control` is 4px.

### Elevation
`--shadow-xs…--shadow-xl` (directional depth + top edge highlight bundled).
Semantic: `--shadow-lifted`, `--shadow-modal`, `--shadow-float`. Use shadows for
floating overlays and shell panes; ordinary content structure should come from
hairline borders.

### Type
Families: `--font-ui` (Plus Jakarta Sans), `--font-code` (Geist Mono, with JetBrains
Mono fallback). Mono labels are uppercase and tracked.
Size scale: `--fs-8…--fs-84` (use the role tokens below, not bare sizes).
Roles: `--type-page-title-*`, `--type-section-title-*`, `--type-item-title-*`,
`--type-metadata-*`, `--type-mono-*`, `--type-body-*`, `--type-eyebrow-*`.
Weights: `--fw-regular/medium/semibold/bold`. Letter-spacing: `--ls-eyebrow` for
uppercase kickers.

### Motion
Durations: `--dur-instant` 120 · `--dur-base` 180 · `--dur-emphasized` 320 ·
`--dur-deliberate` 420. Easing: `--ease-standard`, `--ease-out-quint` (entrances),
`--ease-in-quad` (exits), `--ease-spring` (playful, sparingly).

### Layout dimensions
`--titlebar-h` 40 · `--sidebar-w` 48 · `--left-panel-w` 210 · `--right-panel-w` 284
· `--statusbar-h` 24.

> **Deprecated aliases** (kept until panels migrate, do not use in new code):
> `--space-2xs` (use `--space-xs`), `--font-base/sm/md/lg/xl` (use `--fs-*` or type
> roles), `--text-tertiary` (use `--t3`), `--surface-gradient-subtle`.

---

## Components

All panel primitives live in [`src/components/Panel/`](src/components/Panel/) and are
re-exported from `src/components/Panel/index.ts`. Shared controls live directly in
`src/components/`.

### Panel chrome
| Component | Purpose | Key props |
|-----------|---------|-----------|
| `PanelHeader` | The one panel header. | `kicker`, `brandKicker`, `title`, `subtitle`, `actions` |
| `StateView` | loading / error / empty / ready wrapper. | `isLoading`, `error`, `isEmpty`, `empty`, `onRetry`, `loadingView` |
| `Toolbar` | Action/filter bar under a header. | — |
| `SectionDivider` | Labeled divider between sections. | — |

`StateView` defaults: loading → `SkeletonRows`, error → `EmptyState` + optional Retry.
Always wrap a panel's async body in it instead of writing ad-hoc spinners.

### Surfaces & content
| Component | Purpose | Key props |
|-----------|---------|-----------|
| `Surface` | Base surface. | `variant` (card/feature/well), `padding`, `tone`, `interactive`, `selected` |
| `Card` | Surface with card semantics. | `tone` (default/success/warn/danger/info), `padding`, `interactive`, `selected` |
| `MetricCard` / `Stat` | Numeric KPI display. | — |
| `DataRow` | One row in a dense list/table (`--row-h-*`). | — |
| `Banner` | Inline notice (info/warn/etc.). | — |
| `Badge` / `StatusDot` | Status pills and dots. | — |
| `TabPill` | Tab control. | — |
| `ProgressRing` / `Spinner` / `Skeleton` / `SkeletonText/Rows/Cards` | Progress & loading. | — |
| `KeyHint` | Renders a keyboard shortcut chip. | — |

### Controls & overlays (`src/components/`)
`Button` (`variant`: primary/secondary/destructive/ghost · `size`: sm/md/lg) ·
`Toggle` · `ConfirmDialog` · `EmptyState` · `CopyButton` · `CommandPalette` ·
`CommandDrawer` · `ToastHost` · `KeyboardShortcutsOverlay` · `Tour` · `SectionHeader`.

---

## Patterns

### Standard panel
```tsx
import { PanelHeader, StateView, Card } from '../../components/Panel'
import { Button } from '../../components/Button'

function MyPanel() {
  const { data, isLoading, error, reload } = useMyData()
  return (
    <div className="panel-shell">
      <PanelHeader
        kicker="Solana"
        title="My Panel"
        subtitle="What this panel is for."
        actions={<Button variant="primary" onClick={reload}>Refresh</Button>}
      />
      <StateView
        isLoading={isLoading}
        error={error}
        isEmpty={!data?.length}
        empty={{ title: 'Nothing here yet', description: 'Do X to get started.' }}
        onRetry={reload}
      >
        {data?.map((item) => <Card key={item.id}>{/* … */}</Card>)}
      </StateView>
    </div>
  )
}
```

Rules for every panel:
- Header is **always** `PanelHeader`. No hand-rolled `<header>`.
- Async body is **always** wrapped in `StateView`.
- Lists of items use `Card`/`DataRow`, not bespoke divs.
- Actions are `Button` with the right `variant`.

### Forms
Inputs get the green focus ring (`--focus-ring`). Group with `SectionDivider`.
Validate on blur; show errors with `Banner` tone="danger" or inline helper text.

### Tables / dense lists
Use `DataRow` at a fixed `--row-h-compact|default|comfy`. Right-align numerics, use
`--font-code` for addresses/hashes, truncate with copy affordance (`CopyButton`).

### Dialogs & toasts
Confirmations → `ConfirmDialog`. Transient feedback → `ToastHost`. Never `window.alert`.

---

## Accessibility baseline

- Every interactive element has a visible `:focus-visible` ring from a `--focus-ring*` token.
- Full keyboard operability; shortcuts registered in `KeyboardShortcutsOverlay`.
- `prefers-reduced-motion` respected (tokens collapse durations to 1ms).
- Text meets contrast against its surface (the text ladder is tuned for this — don't
  put `--t4` on `--surface-raised` for body copy).
- Gates: `pnpm run test:a11y`, `pnpm run test:keyboard`.

---

## Enforcement

- `pnpm run lint:styles` — `scripts/style-debt-check.mjs` counts literal font-sizes,
  radii, hex colors, inline shadows, and **hand-rolled panel headers** against a
  baseline that only goes down. The header rule flags panel `.tsx` files that use a
  bespoke `<header className="*-header">` instead of the shared `PanelHeader`.
- `pnpm run test:visual` — visual regression; update baselines only for intended changes.
- `pnpm run typecheck` — primitive prop changes are type-checked across all call sites.

When you migrate a panel onto shared chrome, lower the relevant baseline in
`scripts/style-debt-check.mjs` so the win is locked in.

---

## Adoption status

The token layer and primitive kit are mature. The active work is **adoption**: as of
this writing only a minority of panels use `PanelHeader`/`StateView`. Migration order:
core daily panels first (Dashboard, Git, Settings, Wallet, FileExplorer, Terminal,
DAEMON AI), then agent panels, then the long tail. See
[`docs/internal/`](docs/internal/) planning notes for the rollout.
