# Changelog

## 1.0.0 — Final polish pass

The repository started empty, so this pass delivers NEON HQ as a complete, polished game and then audits it against the brief (see `AUDIT.md`).

### Game
- Deterministic simulation: workers with skill, mood, energy and traits; eight room types (Command, Factory, Shop, Treasury, Chill Bar, Server Room, Studio, Lab) with three visual levels each; hiring, bonuses, raises, assignments, floors, upgrades.
- Economy tuned with a 30-day balance script (`npm run balance`): no flat-cash streak longer than one day, bankruptcy only with very bad choices, $1M revenue reachable by day ~26.
- Nine event types, each with 2–3 choices that show cost and effect before you decide.
- Milestone track in the Command room with rewards and cinematic title cards; confetti in the palette colours.
- Daily report card at midnight: revenue, spent, profit, best worker and a highlight.
- Short three-step tutorial that points arrows at the real UI; skippable.
- Save survives reloads; old saves are migrated.

### Look
- WebGL (PixiJS) 2.5D scene: parallax city with traffic, flying cars, helicopters, palms, heat haze, wet reflections and drifting clouds; full day–night cycle (sunrise, golden hour, pink-orange sunset, neon night, rain on some afternoons) driving lighting, window glow and the colour grade.
- Rooms with baked, dense props (desks with cables and clutter, moving monitor screens, blinking server LEDs, pool table, vending machines, plants, posters), a coloured light per room, volumetric window shafts and glossy floor reflections. Upgrades change furniture, materials and lighting.
- Rigged characters with elbows, distinct outfits and hair, blink, look-around, breathing, typing with screen glow, stretching, pool shots, high-fives, celebrations and the underpaid stomp; name tags with a mood dot.
- Elevator pod with opening doors and a ding; cinematic camera with inertia, handheld sway, double-tap zoom, Locate glide, shake on viral hits/outages and an establishing shot on launch.
- Post stack: bloom, film grade (teal shadows, golden highlights), vignette, grain, chromatic aberration, motion blur on fast pans and lens flares on neon signs. Three quality tiers (High / Balanced / Battery) auto-detected with a manual switch.
- Design tokens in one file (`src/styles/tokens.css`), Barlow Condensed + Inter, one SVG icon set, frosted-glass panels with spring motion and staggered lists, minimal HUD (cash, day/speed, radar, contextual prompt, dock).

### Chat, sound, feel
- Messenger-style chat: portraits, typing dots, read ticks, timestamps, quick-reply chips, replies split into bubbles; chat commands move workers and pay bonuses with a system chip. Optional server-side AI reply (`api/chat.ts`, key never shipped to the client) with an in-character scripted fallback — the player never sees an error.
- Web Audio synthesis for every effect, positional ambience (city hum, rain, chatter, wind by floor and time of day) and an original synthwave loop with separate sliders; silent until the first tap.
- Coins fly between workers and the cash counter, floating +/- numbers, smooth counting, grouped toasts.

### Performance & quality
- HUD and a CSS skyline paint first; PixiJS, filters, panels, chat and audio stream in lazily (main bundle ≈ 24 kB gzip).
- Lighthouse mobile on the preview build (software GL container): Performance 90, Accessibility 100, Best Practices 100.
- Texture budget per quality tier; render at device pixel ratio (capped per tier).
- 35 unit tests (sim, chat, save, balance, text sweep) and a Playwright suite covering the full flow (name → bonus → chat → meeting → build → reload) plus HUD/touch-target checks at 360, 390, 412 and 1440 px.
