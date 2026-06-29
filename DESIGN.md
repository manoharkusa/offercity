# OfferCity — Design System

**Direction:** *Premium Marketplace* — a serious local-deals platform that still feels exciting. Trustworthy enough that shop owners pay for it, energetic enough that consumers feel the deal.

## Typography
- **Display / headings:** `Clash Display` (600/700) — distinctive, confident headlines. Applied to `h1, h2, h3, .disp`.
- **UI / body:** `Plus Jakarta Sans` (400–800) — clean, professional, highly readable.
- Loaded in `client/index.html` (Plus Jakarta via Google Fonts, Clash Display via Fontshare).
- Avoid: Outfit-only / Inter / system stacks as the *primary* display face.

## Color tokens (CSS variables in `client/src/App.css :root`)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#FAF7F2` | warm page canvas |
| `--bg-warm` | `#F3ECE2` | secondary surfaces, hovers |
| `--surface` | `#FFFFFF` | cards, nav |
| `--ink` | `#1C1714` | primary text (warm near-black) |
| `--muted` | `#7A7268` | secondary text |
| `--brand` | `#E85D04` | deal orange — primary accent, CTAs |
| `--brand-deep` | `#C2410C` | hover / dark accent |
| `--brand-soft` | `#FDEEE3` | soft orange tint (badges, eyebrows) |
| `--emerald` | `#0B6E4F` | savings / discounted prices |
| `--border` | `#ECE5DB` | hairline borders |

`--radius: 14px`, `--radius-sm: 10px`, `--shadow`, `--shadow-lg`.

## Rules
- **No purple.** The old orange→purple hero/placeholder gradients are removed.
- **No emoji as UI chrome icons** — use inline SVG line icons (search, location, etc.). (Category markers and playful accents may keep emoji.)
- Cards: white surface, `--border` hairline, `--radius`, soft `--shadow`, lift on hover.
- Prices: discounted price in `--emerald`, original struck-through in muted.
- Buttons: `--brand` fill, `--brand-deep` hover; inputs get a `--brand-soft` focus ring.
- Nav: white surface with hairline border, wordmark + flame mark, dark `--ink` CTA for "List your shop".
- Hero: calm `--bg` canvas, Clash Display headline with one orange highlight span, "Live deals" eyebrow pill, refined search bar (location row + input + solid orange search button).

## Components touched
`index.html` (fonts, boot loader), `App.css` (tokens, base, navbar, hero, search, cards, forms, buttons, mobile nav), `Navbar.jsx`, `Home.jsx` (hero + search icons).
