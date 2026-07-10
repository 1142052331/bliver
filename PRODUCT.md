# Bliver Product Context

## Register
product

## Product Purpose
Bliver is a mobile-first location social network where people leave footprints on a living map, discover recent public moments across administrative regions, interact around places, and preserve a personal geographic memory over time.

## Target Users
- Mobile users who enjoy recording daily movement, travel, photos, and location-based memories.
- Friends who want a lightweight shared map rather than a conventional chat-first social network.
- People who want to discover and interact with public location stories from their province, country, or the world.

## Core User Outcomes
- Understand what friends and other people have recently shared on the map.
- Publish a footprint with clear control over audience and location precision.
- Move naturally from discovery to reaction, public conversation, direct message, or friendship.
- Build a durable personal map, timeline, photo archive, and retrospective memory.

## Product Principles
1. **The Map Is the Product.** Opening Bliver starts with a living map, not a generic feed or dashboard.
2. **Privacy Is Visible.** Audience and location precision are visible before publishing and enforced by the backend.
3. **Discovery Without Noise.** One chronological stream combines friends and public footprints with explicit relationship and region labels.
4. **Social Depth Is Earned.** Public reactions and comments are easy; friendship and unrestricted messaging represent deeper relationships.
5. **Memories Outlive Discovery.** Public discovery expires, but a footprint remains part of the owner's personal history according to its visibility.
6. **Mobile Decisions Win.** Product architecture, touch targets, sheets, navigation, loading, and error states are designed for phones first.

## Core Product Structure
- **Map:** primary home, geographic discovery, footprint markers, preview cards, region and scope controls.
- **Activity:** unified chronological stream containing friend and public footprints.
- **Messages:** friend conversations and restricted stranger greetings.
- **Me:** profile, personal map, timeline, photos, memories, visitors, and privacy settings.
- **Check-in:** a primary action independent from bottom navigation.

## Visibility and Discovery
- New footprints support `public`, `friends`, and `private` visibility.
- First publication defaults to `public`; later publications reuse the user's last selection.
- Location precision remains independently selectable as precise or approximate.
- Only footprints explicitly marked `public` enter stranger discovery.
- Public footprints remain in discovery for 24 hours, then remain in the owner's history and continue to follow normal friend/private visibility rules.
- Discovery uses an intelligent fallback from the current first-level administrative region, to the current country, to global content.
- The unified stream is strictly reverse chronological; friends receive no ranking boost.
- Legacy footprints without the new visibility field are not migrated and are not automatically added to stranger discovery.

## Social and Safety Model
- Public footprints support reactions, public comments, two-level replies, direct-message greetings, friend requests, reports, and blocks.
- Comments are chronological from oldest to newest within each level.
- A stranger can send one greeting message; normal conversation unlocks only after the recipient replies.
- Users can disable stranger messages.
- Blocking makes profiles, public content, comments, and messages mutually invisible.
- Profiles are open, but footprint visibility remains authoritative.
- Profile visitor history is visible only to the profile owner.
- Following, followers, reposting, and unlimited comment nesting are deliberately excluded from the first redesign phase.

## Brand Personality
- Natural, urban, observant, warm, and socially alive.
- Modern without looking like a generic SaaS dashboard.
- Youthful without neon gaming aesthetics or childish illustration.
- Calm enough for long-term memory keeping, immediate enough for live social discovery.

## Anti-References
- The current black glassmorphism, neon gradients, floating-button clutter, and inconsistent corner radii.
- Generic social feeds that hide the map behind a conventional vertical timeline.
- Overdecorated AI-generated interfaces with gradients, glow, excessive pills, and ornamental motion.
- Travel-journal nostalgia that weakens live social interaction.
- Dark radar interfaces that become tiring during everyday use.

## Accessibility & Inclusion
- Target WCAG 2.2 AA contrast and interaction requirements.
- Interactive targets are at least 44 by 44 CSS pixels.
- Support safe areas, dynamic mobile keyboards, reduced motion, screen readers, and visible focus states.
- Do not communicate relationship, scope, privacy, or error state through color alone.
- Location denial, slow networks, offline states, upload failure, empty discovery, and expired authentication require actionable UI.
