# Changelog

## 1.4.0 — NEON CITY: PS2-era art direction, NPCs, props, parkour, traffic lights

Art direction pivoted to an intentional early-2000s open-world look (same map, missions, cars and controls).
- Diffuse-only materials everywhere (Lambert, no normal/roughness/metalness maps, no environment maps, no tone mapping), flat directional sun + hemisphere fill, no shadow maps; blob shadows under every person and car.
- Heavy distance fog that takes the sky colour by time of day; gradient sky dome, flat cloud sheet, stars, sun disc.
- Post reduced to a mild grade (light vignette, warm tint at sunset). No bloom, blur, grain, AO or chromatic aberration.
- Wet dusk/night roads: planar mirror under a translucent asphalt plane; rain particles at night.
- Characters: blocky bodies, mitten hands, painted faces on flat heads, stepped walk cycles. Cars: box shells with flat shading, box lights, opaque-ish windows, no interiors (driver + door kept).
- Texture filtering toggle in the HUD: Soft (linear) / Crisp (nearest).
- Train: a roof collider is rebuilt from the train mesh every frame; prompt reads "Surfing the train · Space to jump off". Context tips differ on foot / in a vehicle / on the train.
- Street dressing: dumpsters, shipping containers, market stalls, café terraces, hydrants, mailboxes, planters, cones and barriers, scooters, posters; working traffic lights that AI drivers obey; buses in traffic.
- NPCs with lives: walkers, joggers, chatting groups, café sitters, phone checkers; they flee from fast cars and the horn, and get knocked over.
- Parkour: Space jumps; low obstacles are vaulted when you run at them; ledges up to 3 m are mantled; long falls end in a roll.
- Fixed: delivery payout confirmed to update the CASH HUD (covered by e2e); player stuck inside a solid now exits through the nearest face.

## 1.3.0 — NEON CITY: train surfing, bike, car doors and interiors, rooftop

- Walkable elevation: platforms, ramps and gravity. A staircase by the third avenue climbs to the rail viaduct; the train slows into the station, waits, and you can ride on its roof (surf pose, carried with the train, jump off anywhere).
- A fire escape on the block west of the plaza leads to a rooftop with a table, chairs and a plant for the sunset view.
- Bikes parked by the plaza: grab one with E (no wanted level), lean into corners, rider pedals with the wheels.
- Cars have interiors (seats, dashboard, driver) and a driver's door that swings open when you get in or out.
- Camera backs off and rises when you are above street level.

## 1.2.0 — NEON CITY: golden-hour look, carjacking and police

Art direction moved from neon-night to a PS2-era open-world realism reference: golden-hour haze, warm plaster and brick blocks, long shadows, foggy horizons.
- Keyframed gradient sky dome with sun disc, glow and lens flare; full day-night cycle (14 real minutes) driving sun, hemisphere, fog colour, exposure, window glow, street lamps and car headlights. `?hour=` forces a time.
- Procedural facades (plaster, brick, concrete, curtain-wall glass, industrial) with window frames, sills, floor ledges and lit interiors at night; five districts (old town, residential, modern towers, industrial, central plaza); pitched tiled roofs with chimneys, cornices, awnings, shopfronts, kerbs, cobbled plaza with a monument column, low-poly trees, graffiti wall, an elevated brick rail viaduct with a running train, a needle tower and a domed hall on the horizon.
- Properly proportioned humans (7.5 heads, hips/knees/elbows, hoodies, caps, sneakers) with walk, run and idle cycles; pedestrians use the same rig.
- Five car silhouettes (sedan, hatchback, sports, van, taxi) with bevelled bodies, wheel arches, mirrors, plates and exhausts; sports car for the player.
- Take any car on the street (E next to it); stealing one raises the wanted level. Hitting pedestrians or ramming traffic adds heat; stars appear in the HUD, police cruisers with light bars spawn and chase, sirens play, and the heat cools off when you lose them.
- Ambient occlusion (GTAO) on the High tier; sun shadows fixed; speed blur and warm colour grade tied to the time of day.

## 1.1.0 — NEON CITY (first pass)

An original open-world driving mini game added at `/` (NEON HQ moved to `/hq.html`).
- Procedural 7×7-block night city: lit towers with window atlases, glass towers, neon shopfront trims and signs, billboards, street lamps with real light pools, traffic lights, parked cars, palms, a plaza fountain, a distant skyline ring, stars and moon.
- Car with arcade physics (drift on the handbrake, body roll, wheel steer/spin, capsule collision that slides along walls), real headlight spotlights with shadows on High, tail lights that brighten on braking, underglow, drift smoke.
- On-foot player with camera-relative movement; enter/leave the car; chase, far and hood cameras with speed-dependent FOV and radial speed blur; establishing orbit on start.
- AI traffic that follows lanes and turns at intersections, yields to you, and pedestrians who walk the blocks and get knocked over.
- Jobs: deliveries, taxi runs and four-checkpoint street races with timers, cash rewards and time bonuses; a beam marker and a rotating minimap.
- Post stack: Unreal bloom, film grade (teal shadows / warm highlights), vignette, grain, chromatic aberration, SMAA on High. Quality tiers auto-detected (`?q=high|balanced|battery` to force).
- Synthesised engine, tyre screech, horn, chimes and city hum.
- Playwright smoke test drives the car deterministically through a `window.__neoncity.advance()` hook.

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
