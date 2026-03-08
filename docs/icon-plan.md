# Jait Icon Plan

## Project Context (from repo scan)
- Product: "Just Another Intelligent Tool" for developers.
- Core behavior: agent executes terminal/file/browser/system actions with human-in-the-loop consent.
- Brand tone in docs: local-first, observable, secure, deterministic.
- Current state: desktop icon is a placeholder (`J` on dark tile), web still uses Vite default favicon.

## Icon Concept: "Command Loop J"

Create a mark that combines:
- A **terminal prompt cue** (`>`) to represent developer tooling.
- A **clean "J" spine** to keep brand recall for Jait.
- A **partial loop/ring** around the glyph to represent supervision, feedback, and live visibility.

The symbol should read as "developer command + controlled automation," not generic AI sparkle branding.

## Visual Description
- Base shape: rounded square app tile (works for desktop/mobile launchers).
- Background: deep graphite (`#0B0D10`) for a technical, stable feel.
- Primary glyph: geometric `J` + `>` hybrid in bright signal green (`#22C55E`), referencing your existing placeholder accent.
- Secondary accent: thin loop segment in cool cyan (`#38BDF8`) to communicate monitoring/streaming/trust.
- Style: flat/minimal, no heavy gradients, no tiny details.

## Geometry Specs (for designer or SVG build)
- Artboard: `1024x1024`.
- Safe area: keep key glyph inside a centered `768x768` zone.
- Corner radius (tile): `~220`.
- Main stroke weight: `88` (scale proportionally for smaller assets).
- Loop stroke weight: `56`.
- Optical alignment: slightly oversize the `J` bowl to stay legible at 32px and below.

## Small-Size Behavior
- At `16-24px`: drop the cyan loop and keep only the `J + >` silhouette.
- At `32-64px`: keep loop but simplify joins.
- At `128px+`: full detail variant.

## Deliverables
- `icon-master.svg` (1024 vector source).
- `icon-app-1024.png` (store/listing).
- `icon-512.png`, `icon-256.png`, `icon-128.png`, `icon-64.png`, `icon-32.png`, `favicon-16.png`.
- Monochrome glyph variant for system trays and badges.

## Suggested Integration Targets in This Repo
- Desktop: replace [`apps/desktop/assets/icon.svg`](/C:/Users/jakob/.jait/worktrees/Jait/jait-401bf1ce/apps/desktop/assets/icon.svg).
- Web favicon: update [`apps/web/index.html`](/C:/Users/jakob/.jait/worktrees/Jait/jait-401bf1ce/apps/web/index.html) to point to the new icon asset.
- Mobile launcher assets: regenerate Android launcher icons under `apps/mobile/android/app/src/main/res/mipmap-*`.

## Design Guardrails
- Avoid robot heads, chat bubbles, sparkles, and generic "AI brain" motifs.
- Keep strong contrast in both light and dark OS contexts.
- Ensure silhouette recognizability before decorative detail.
