# Icons

Place static icon files (SVG/PNG) here.

**Current implementation:** The site uses inline SVG icons (Feather-style,
stroke-based, 24×24 viewBox) directly in the HTML markup. This keeps the
project dependency-free — no icon font or external library is required.

Icons currently in use:

| Location | Icon |
|----------|------|
| `index.html` — hero card | Wrench (maintenance) |
| `index.html` — Features: Submit Complaints | File-text (document) |
| `index.html` — Features: Track Progress | Search |
| `index.html` — Features: Room Management | Home |
| `index.html` — Features: Management Console | Bar-chart |
| `index.html` — Features: Secure Access | Lock |
| `index.html` — Features: Fast & Simple | Zap |
| `dashboard.html` — Submit Complaint action | File-text (document) |
| `dashboard.html` — Track Complaints action | Search |

All icons use `stroke="currentColor"` so they inherit the surrounding element's
color and integrate with the existing CSS design system.
