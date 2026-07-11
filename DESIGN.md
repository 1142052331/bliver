---
name: Bliver Natural City
description: A warm, mobile-first living map for public discovery, friendship, and personal geographic memory.
colors:
  forest: "#173B31"
  forest-soft: "#2D594D"
  sage: "#A9C9BF"
  sage-soft: "#E5EEE9"
  warm-paper: "#FAF8F3"
  warm-surface: "#FFFFFF"
  ink: "#1E2925"
  muted-ink: "#5D7068"
  coral: "#C54B36"
  coral-active: "#AD3D2D"
  border: "#D7E1DC"
  success: "#27805E"
  warning: "#A96B17"
  danger: "#B83B3B"
  info: "#356F91"
typography:
  brand:
    fontFamily: "Newsreader, Noto Serif SC, Georgia, serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, Noto Sans SC, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  heading:
    fontFamily: "Inter, Noto Sans SC, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, Noto Sans SC, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  utility:
    fontFamily: "Inter, Noto Sans SC, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0.01em"
rounded:
  sm: "10px"
  md: "16px"
  lg: "24px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.warm-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 18px"
    height: "48px"
  button-primary-active:
    backgroundColor: "{colors.forest-soft}"
    textColor: "{colors.warm-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 18px"
    height: "48px"
  checkin-action:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.warm-surface}"
    typography: "{typography.heading}"
    rounded: "{rounded.lg}"
    size: "56px"
  surface-card:
    backgroundColor: "{colors.warm-surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "16px"
  scope-chip-selected:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.warm-surface}"
    typography: "{typography.utility}"
    rounded: "{rounded.full}"
    padding: "8px 12px"
---

## Overview
Bliver uses the **Natural City** system: a quiet, warm interface layered over a living map. The product feels socially active through content and state, not through decorative glow or constant animation.

**The Map-First Rule.** The map remains visible whenever spatial context matters. Details rise from the bottom; they do not replace the map until the user intentionally enters a full page.

**The One-Bold-Thing Rule.** Coral is reserved for check-in, publish, and urgent attention. If three elements compete in coral, the design is wrong.

**The Mobile Truth Rule.** The canonical canvas is a phone around 390 by 844 CSS pixels. Desktop adapts into wider or split layouts without changing the mobile information architecture.

## Colors
**The Living Neutral Rule.** Backgrounds are warm paper and sage-tinted surfaces, never sterile blue-gray. Forest ink replaces pure black for primary text and navigation.

**The Functional Accent Rule.** Forest indicates selection and primary navigation. Coral indicates creation and publication. Semantic colors remain independent and always include icon or text support.

Coral and coral-active are the primary-action tokens for white text at WCAG AA contrast.

Map tiles should be visually softened enough for markers and cards to lead, but place labels and geographic boundaries must remain readable. Relationship and scope markers may use restrained supporting hues, but never rely on hue alone.

## Typography
Product controls, content, labels, and data use one highly legible sans-serif system. Chinese fallback quality is mandatory. The serif brand face appears only in the Bliver wordmark and rare memory-oriented headings; it is prohibited in buttons, form labels, navigation, or dense UI.

**The Tight Product Scale Rule.** Hierarchy comes from weight, spacing, and a compact type scale rather than oversized headings. Body text remains at least 15px on mobile.

**The Plain Language Rule.** Controls describe the action: “发布足迹”, “允许陌生人私信”, “仅好友可见”. Avoid cute or technical labels where privacy and safety are involved.

## Elevation
Elevation communicates temporary layers: map controls, preview cards, bottom navigation, and sheets. Cards use soft, broad shadows with low opacity. Dark hard-edged shadows, luminous glows, and stacked glass panels are prohibited.

Only one major sheet may be open at a time. Sheets use a clear drag handle, stable resting positions, safe-area padding, and a scrim only when the underlying map should stop accepting input.

Motion lasts 150–250ms and communicates state changes. The signature “footprint pulse” plays once when a new marker appears, after publishing, or when focusing a selected location. Decorative looping motion is forbidden and reduced-motion preferences remove the pulse.

## Components
**Bottom Navigation.** Contains exactly four destinations: 地图, 动态, 消息, 我的. It is navigation only. Check-in is a separate coral action and must never masquerade as a tab.

**Map Controls.** Region, search, filter, and locate controls occupy lightweight 44px minimum targets near the top and map edges. They must not form a dense desktop-style toolbar.

**Footprint Markers.** Markers prioritize the person or moment, with relationship/scope communicated through a ring, badge, or short label. Newly appearing markers may play one footprint pulse.

**Preview Cards.** A single bottom card summarizes the selected or newest footprint and preserves map context. The card exposes one clear path into full detail.

**Activity Cards.** Use the same content hierarchy everywhere: identity and relationship, place and time, content, media, then reactions and comments. Friend, province, country, and global labels are explicit.

**Publishing Controls.** Visibility and location precision appear beside the publish action and open understandable selection sheets. The UI previews what other people can see.

**Loading and Failure.** Use skeletons for structured content. Empty states suggest the next useful action. Errors state what failed and how to retry; generic apologies and endless spinners are prohibited.

## Do's and Don'ts
**Do** preserve the map as Bliver's differentiator, use bottom sheets for spatial detail, keep touch targets large, and make privacy state continuously visible.

**Do** use consistent radii, icons, labels, focus rings, loading states, and motion durations across the core flow.

**Don't** recreate the current black glassmorphism, neon gradients, floating-button clutter, or inconsistent corner radii.

**Don't** produce a generic social feed that could belong to any photo app, or a generic AI product interface built from gradients, glow, excessive pills, and ornamental motion.

**Don't** let travel-journal nostalgia weaken live interaction, or let a dark radar aesthetic make everyday use tiring.

**Don't** hide safety controls in overflow menus when a user is interacting with strangers. Report, block, visibility, and message permissions must be easy to find.
