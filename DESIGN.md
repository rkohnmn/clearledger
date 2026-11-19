# ClearLedger — Design System (`DESIGN.md`)

## 1. Visual Thesis
ClearLedger feels editorial, calm, and financially authoritative: warm alabaster paper (`#FBFBF8`), deep carbon ink (`#141513`), crisp `1px` structural hairlines (`#E2E1DC`), a single restrained forest-pine accent (`#165B43`) for primary actions and positive savings, and signal-vermilion (`#B83220`) reserved strictly for silent price hikes, duplicate charges, and budget overruns. Every numeric figure uses tabular monospace alignment so amounts scan vertically like a precision financial ledger.

## 2. Color Tokens (WCAG 2.2 AA / AAA Verified)

### Light Theme (Default — Editorial Paper)
| Token | Hex | Role | Contrast vs Surface |
|---|---|---|---|
| `--bg-canvas` | `#F7F6F2` | Page background | — |
| `--bg-surface` | `#FFFFFF` | Primary cards, ledger table, modals | — |
| `--bg-subtle` | `#F0EFEA` | Secondary panels, table headers, badges | — |
| `--border-hairline` | `#E2E1DC` | 1px structural rules and card boundaries | — |
| `--border-strong` | `#C7C5BC` | Input borders, active focus frames | — |
| `--text-primary` | `#141513` | Primary headings, amounts, body copy | 18.2:1 (AAA) |
| `--text-secondary` | `#4A4D48` | Descriptions, metadata, axis labels | 8.1:1 (AAA) |
| `--text-muted` | `#5F635D` | Footnotes, secondary timestamps | 5.8:1 (AA+) |
| `--accent-primary` | `#165B43` | Primary CTA, active nav, positive savings | 8.0:1 (AAA) |
| `--accent-hover` | `#104633` | Primary button hover | 10.6:1 (AAA) |
| `--accent-soft` | `#E7F3EE` | Active nav tint, positive pill surface | — |
| `--status-danger` | `#B83220` | Price hikes, duplicate alerts, over-budget | 6.2:1 (AA+) |
| `--status-danger-soft` | `#FDF0EE` | Alert strip surface | — |
| `--status-warn` | `#92580A` | Review status, approaching budget | 5.6:1 (AA+) |
| `--status-warn-soft` | `#FEF6E8` | Warning pill surface | — |
| `--status-info` | `#1E568E` | Neutral inflow / transfer tag | 7.3:1 (AAA) |

### Dark Theme (`[data-theme="dark"]` — Carbon Ledger)
| Token | Hex | Role |
|---|---|---|
| `--bg-canvas` | `#0D100E` | Page background |
| `--bg-surface` | `#141916` | Primary cards, ledger table, modals |
| `--bg-subtle` | `#1B211E` | Secondary panels, table headers |
| `--border-hairline` | `#272F2A` | 1px structural dividers |
| `--border-strong` | `#3B4640` | Input borders |
| `--text-primary` | `#EDF1EE` | Primary text and figures |
| `--text-secondary` | `#B0B9B3` | Descriptions and axis labels |
| `--text-muted` | `#8F9A93` | Footnotes and timestamps |
| `--accent-primary` | `#3EA87E` | Primary interactive accent |
| `--accent-hover` | `#52BE93` | Hover state |
| `--accent-soft` | `rgba(62, 168, 126, 0.14)` | Subtle accent surface |
| `--status-danger` | `#F06A5A` | Price hikes and alerts |
| `--status-warn` | `#E5A93B` | Review / caution |

## 3. Typography System
- **Display / Section Headings**: `'Newsreader', 'Iowan Old Style', 'Georgia', serif` — editorial gravitas with tight tracking (`-0.025em`) and `line-height: 1.12`.
- **UI / Body**: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` — clean legibility (`14px`–`15px` UI, `line-height: 1.5`).
- **Financial Figures & Code**: `'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace` with mandatory `font-variant-numeric: tabular-nums lining-nums`.
- **Font Loading Strategy**: Zero render-blocking external font requests in offline/local mode; clean system editorial serif/sans/mono stack works instantaneously offline with zero CLS.

## 4. Spacing, Layout & Responsive Breakpoints
- **8pt Base Grid**: `4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`, `64px`.
- **Shell**: Left rail navigation (`240px`) on desktop (`>= 1024px`) + crisp top utility bar (`56px`) + fluid workbench canvas (`max-width: 1280px`).
- **Tablet (`768px–1023px`)**: Compact top tab bar + 2-column KPI grid + single-column chart stack.
- **Mobile (`320px–767px`)**: Sticky top bar with compact drawer navigation, horizontally scrollable filter chips, stacked KPI cards, and card-adapted ledger rows with zero horizontal overflow.

## 5. Data Visualization Standards
- Every magnitude bar chart uses a **true zero baseline** (Lie Factor = 1.00).
- Direct value labels on category bars and subscription breakdowns; zero detached legends when series <= 6.
- Redundant encoding: Income vs. Expenses distinguished by both hue (pine vs. slate-ink) and subtle pattern/label cues for colorblind accessibility.
- Takeaway-driven chart headlines computed dynamically from the user's loaded dataset.

## 6. Motion & Accessibility
- Micro-transitions: `150ms cubic-bezier(0.22, 1, 0.36, 1)` on border luminance, surface tint, and tab indicators.
- Zero `hover:scale-105` card animations; zero decorative pulsing.
- Full `@media (prefers-reduced-motion: reduce)` support disabling all transitions.
- Visible `2px solid var(--accent-primary)` focus rings via `:focus-visible`, full keyboard shortcuts (`/` search, `1-5` views, `Escape` close dialog), semantic landmarks (`header`, `nav`, `main`, `aside`), and `aria-live="polite"` status announcements.
