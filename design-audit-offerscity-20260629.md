# OfferCity — Design Audit (Desktop + Mobile)
Date: 2026-06-29 | URL: https://offerscity.co.in | Scope: Homepage, responsive

## Scores
- Design Score: B  (solid, professional on desktop/tablet; mobile needs work)
- AI Slop Score: B+ (real typeface, brand-forward — avoids the common slop traps)

## What's good
- Outfit typeface (real font, not generic system stack)
- Coherent orange brand, clean desktop + tablet layouts
- No console errors; fast TTFB (26ms)
- Clear hierarchy and CTAs on desktop

## Findings
### HIGH
1. Mobile search bar overflows — search input (right=411px) and magnifier button (right=461px) extend past the 375px viewport; the search button is clipped off-screen. Search is the primary action. Fix: stack location selector above input on mobile, make input full-width.

### MEDIUM
2. Mobile offer card oversized — one card fills the whole viewport with a tiny emoji in a huge colored block; users see only 1 offer. Fix: reduce image/card height on mobile, use a compact list like tablet.
3. Touch targets <44px on mobile — category pills (h=34), hamburger (35x34), close (30x30). Below the 44px accessibility minimum. Fix: min-height 44px.
4. Emoji as product imagery — offers use 🍽️/💄 instead of real photos; reads as placeholder, huge on mobile. Fix: real images or polished placeholder.
5. Load ~3.26s / domReady ~3.1s — React bundle parse/execute delay. Fix: code-split / lazy-load routes.

### LOW / POLISH
6. Heading order: an H2 ("Get the Best Deals Near You!") appears before the H1 in the DOM (SEO/a11y).
7. 24 unique colors (threshold ~12) — consolidate into design tokens.
8. Root <html> font-family falls back to Times New Roman — set font on html/body for safety.
