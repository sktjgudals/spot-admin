# Dopa Admin design system

## Direction

Dopa Admin is a repeated-use operations console. Its interface is intentionally
quiet, dense and scannable: neutral surfaces carry the information hierarchy,
while Dopa purple is reserved for focus, selection and the primary action. The
memorable detail is the narrow active rail used in navigation and queue states;
it gives operators orientation without turning every surface purple.

SUPER_ADMIN is desktop-first and optimized for tables, queues and detail
inspection. BUSINESS_ADMIN remains mobile-first, but it expands into a centered
workspace on tablets and desktops instead of emulating a phone frame.

## Foundations

- Typography: the native Korean system stack (`Apple SD Gothic Neo`,
  `Noto Sans KR`, platform UI fonts), with tabular numerals for operational
  metrics, amounts and timestamps. The previous 2 MB all-glyph Pretendard file
  is intentionally not referenced by the root shell; a brand font may return
  only as measured, unicode-range subsets that do not tax every admin route.
- Spacing: a 4px base rhythm. Dense controls are 32–36px on desktop; touch
  controls remain at least 44px on mobile.
- Shape: 8px base radius, 12px panels and restrained elevation. Nested cards
  are avoided; borders and spacing express hierarchy first.
- Color: semantic variables only. `primary` is an action color. Success,
  warning, danger and information each have independent hues and text pairs.
  Hover colors are opaque theme tokens, and text pairs are held to at least
  4.5:1 contrast in both themes.
- Motion: 100–200ms state transitions only. Reduced-motion preferences remove
  non-essential animation.
- Theme: light and dark themes carry the same semantic roles and contrast.
- Assets: install icons reuse the released Dopa store artwork at each target size;
  metadata, manifest and Apple touch assets are kept in the Next.js app/public conventions.

## Component rules

- Every page begins with one page header, optional description and a compact
  action toolbar; it does not repeat the shell title in oversized type.
- Tables use sticky headers, tabular data, visible focus, stable row height and
  an alternate mobile representation when horizontal scanning is impractical.
- Loading states preserve the shape of the final content. Errors state what
  failed and offer one clear retry. Empty states distinguish no data from a
  filtered result.
- Destructive and externally visible operations always summarize the target and
  require the same reason fields enforced by the API.
- Status is never color-only. Text or an icon accompanies every semantic color.
- Keyboard focus uses the opaque `ring` token rather than alpha compositing;
  the indicator maintains at least 3:1 contrast against its adjacent surface.

## Tokens and source of truth

Runtime CSS variables live in `src/app/globals.css`. The adjacent
`design-tokens.json` mirrors light and dark colors plus typography, spacing,
density, radius, elevation and motion for design tooling. When a token changes,
update both files and the preview in the same change. The preview follows the
operating-system theme so both palettes can be reviewed without a separate build.

## Baseline audit

Before this redesign, global semantic variables coexisted with extensive raw
hex values, desktop pages mixed slate utilities with brand colors, dark mode was
incomplete, and BUSINESS_ADMIN was constrained to a 430px phone mockup. The
redesign removes those parallel visual systems incrementally while preserving
the existing product and API behavior.
