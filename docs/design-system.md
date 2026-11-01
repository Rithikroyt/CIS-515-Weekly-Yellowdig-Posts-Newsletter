# Design system

An editorial publication combined with a technical observatory: serif headlines, a calm sans-serif interface, maroon identity with gold accents, and node-and-path motifs. It is inspired by ASU colours but is not an official ASU product.

## Tokens (`web/src/app/globals.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--canvas` | `#F6F3EE` | `#0D1117` | Page background |
| `--surface` / `--raised` | `#FFFFFF` / `#FBFAF8` | `#151B25` / `#1B2230` | Cards / panels |
| `--ink` / `--ink-2` / `--muted` | `#172032` / `#465065` / `#667085` | `#F5F2EC` / `#C7CDD8` / `#98A2B3` | Text levels |
| `--border` | `#DED8CF` | `#2B3443` | Lines |
| `--maroon` / `--maroon-deep` | `#8C1D40` / `#64152F` | `#D45A7D` / `#E889A5` | Identity, primary actions, AI-drafted |
| `--gold` / `--gold-muted` | `#FFC627` / `#E5AD16` | same | Accent only (never small text on white) |
| `--blue` | `#3157D5` | `#7C9BFF` | Code-counted, focus ring |
| `--teal` | `#0F766E` | `#4BC3B1` | Approved, verified, human |
| `--amber` | `#9A5B08` | `#E5A94C` | Review, reference, provisional |
| `--red` | `#B42318` | `#FF7A70` | Errors and failure paths only |

Dark mode follows `prefers-color-scheme`. The header toggle stores a choice in `localStorage` (`obs-theme`), applied before paint.

## Type

- **Source Serif 4** for publication headings, dek and narrative text.
- **Inter** for the interface, data and labels.
- **JetBrains Mono** for identifiers (run IDs, hashes, evidence refs).

All three load through `next/font`. Headline sizes use `clamp()`; body text is 16px with a 1.6 line height and a 70ch reading width.

## Components

| Class / component | Purpose |
|---|---|
| `.badge-*`, `Prov`, `KindBadge` | Provenance (CODE-COUNTED blue, AI-DRAFTED maroon, HUMAN-APPROVED teal, REFERENCE amber) and week state, always with text |
| `.card`, `.panel`, `.notice(-info/-ok/-error)` | Surfaces and messages |
| `.btn`, `.btn-primary` | 44px minimum targets |
| `WeekNav` | Desktop timeline with node states; mobile select with previous/next |
| `.metrics`, `.metric` | Code-counted metric cards with a definition line |
| `.bars` | Horizontal bars, each paired with a screen-reader table |
| `.path`, `.chip` | Workflow main path |
| `.fsteps`, `FailureFigure` | Failure path |
| `WorkflowGraph`, `.legend` | Atlas diagram |
| `PipelineFigure`, `EmptyFigure`, `BrandMark` | Original SVG illustrations |

## Motion

There is one short reveal on the masthead and hero, and a slow dashed trace on the hero pipeline. Both are disabled under `prefers-reduced-motion`. There are no counters, particles or simulated progress.
