# NEON HQ — Polish Audit

Method: the repository had no game in it, so NEON HQ was built from scratch in this pass and then audited the same way the brief asks for: ten game days at 5× speed through a headless browser, every panel, room, worker, event, upgrade, chat and meeting exercised, screenshots at 390×844 and 1440×900 after every step (`scratchpad/shots/v0 … vN`), a 30-day balance run (`npm run balance`), and a source sweep with `rg -i "todo|placeholder|coming soon|lorem|mock|simulat|dummy|fake|tbd|wip"`.

Legend: `[x]` fixed in this pass · `[ ]` open

## Blocking bugs
- [x] WebGL scene never appeared: `generateTexture` was passed a plain object instead of a `Rectangle` frame, so the renderer threw on the first bake and the CSS skyline stayed on screen.
- [x] Scene rendered black once it started: the custom colour-grade fragment shader lacked `precision highp float;`, so the program failed to link (`uInputSize` precision mismatch).
- [x] Every avatar was blank: `canvas.cloneNode()` copies the element, not its bitmap. Portraits are now drawn once and copied with `drawImage`.
- [x] Nothing on the HUD was clickable: the invisible panel scrim kept `pointer-events: auto`.
- [x] On phones the dock was unreachable while a bottom sheet was open and the dock overlapped the radar at 360–412 px.
- [x] Chat called `/api/chat` on localhost and logged a 404 to the console on every message. Local builds skip the call; the endpoint now answers 200 `{bubbles:null}` when the AI is unavailable so the console stays clean on the deployed site too.

## Rough edges and ugly screens
- [x] Tutorial tips floated over whichever panel was open and pointed at a dock button hidden beneath it. Step 1 now completes when Team opens; fallback tips only appear when no panel is open.
- [x] Far skyline towers dwarfed the HQ; they now sit at half scale with haze, so the tower reads as the hero.
- [x] A peach sky showed through below the street; the ground now extends to the bottom of the world.
- [x] The sky gradient texture was regenerated every frame (texture churn); it is now keyed by ten-minute steps.
- [x] Typing workers held one arm straight out — the rig had no elbows. Arms now have upper/forearm joints with bent typing, pool-shot, meeting and stretch poses.
- [x] Room props were too small against 92 px workers; furniture is painted at 1.28× and rooms gained cables, clutter, posters, lamps and skirting.
- [x] Room icons in the Build grid rendered at 100+ px.
- [x] “HOODIE PRICE” wrapped in the Treasury; the stat is now “Unit price” and the first product is a shirt.
- [x] Daily report showed the day’s revenue under the best worker instead of what they personally earned.
- [x] Bonus toasts stacked separately; sales now group (“Luke sold 3 shirts, +$135”).
- [ ] Rooms still read flatter than the target; see Visual backlog below.

## Balance (30-day script, three policies)
- [x] Event payouts scaled with total revenue without a cap: a $171k viral day and a $60k rent penalty on day 20. Scale is now `min(14, sqrt(revenue/2500))`.
- [x] Sellers sold slower than makers produced; stock piled to 3,000+. Sell rate 1.15×, make rate 1.0×.
- [x] The balance script never built a Lab, so product value stayed at $42 for 30 days.
- Result: greedy-but-sane policy reaches $1M revenue on day ~26 with no bankruptcy; cautious policy grows steadily; only the “hire 22 people into 3 rooms and never build” policy goes bankrupt. Longest flat-cash streak: 1 day. (`npm run balance -- --policy=greedy|cautious|bad`)

## Placeholder / forbidden text
- [x] Source sweep: the only hits are HTML `placeholder=` attributes on inputs and the word “wiped” in a worker line. No “TODO”, “coming soon”, “lorem”, “mock”, “simulated”, “demo”, “test” or “fake” in any user-visible string.
- [x] Exactly one fiction line, in More › About: “NEON HQ is a game. All money and workers are fictional.” (asserted by the Playwright suite).
- [x] A unit test plays ten game days and sweeps every generated event, chat line, toast, ledger entry and report highlight for the forbidden words.
- [x] Every empty state has an icon, one helpful line and an action (no candidates, no workers in a room, empty ledger, no chats).
- [x] Every button does something; the only disabled buttons state why (“Need $…”, “Tower at full height”, “Fully upgraded”, “Next meeting tomorrow”).

## Confusing steps
- [x] First five minutes: start cash $650, 14 units in stock, first sale within seconds, first $1,000 milestone inside ~90 s at 1×, bonus prompt at step 2 of the 3-step tutorial.
- [x] Event choices show cost and effect before you choose; unaffordable choices are disabled with the price visible.
- [x] One meeting per day is explained in the Command panel header (“Next meeting tomorrow”).
- [x] Speed chip cycles 1× → 2× → 5×.

## Performance
- [x] Pixi, pixi-filters, panels, chat and audio are lazy-loaded; the first paint is the HUD plus a CSS skyline (main bundle ≈ 62 kB gzip ≈ 24 kB).
- [x] Quality tiers High / Balanced / Battery, auto-detected (GPU string, cores, memory, frame pacing) with a manual switch in More.
- [x] Texture budget per tier (48 / 24 / 10 MP) enforced when baking room, skyline and worker textures.
- [ ] Lighthouse mobile run and numbers — see CHANGELOG once measured.

## Visual backlog (open, in priority order)
- [ ] Denser room dressing at level 1 (whiteboards, cabinets, rugs) and clearer level 2/3 material changes.
- [ ] Soft shadows under furniture and stronger floor reflections of workers.
- [ ] Rain streaks on the window glass.

## NEON CITY (first pass) — known rough edges
- [x] AI cars carried two real SpotLights each (50+ per-pixel lights): removed; only the player's car has real headlights.
- [x] A parked car crept backwards forever (brake-while-stopped meant reverse); the parking brake now holds.
- [x] On-foot movement was inverted relative to the camera.
- [x] The car's nose sank into buildings and dragged the camera inside walls; capsule collision + camera walk-back.
- [x] Car model is now bevelled with five silhouettes; interiors are still opaque glass.
- [x] Day-night cycle with a keyframed sky dome replaces the always-night look.
- [x] Sun shadows were missing (shadow camera never updated its projection).
- [ ] Pedestrians have no reaction to the horn; traffic does not stop at the lights (lights are cosmetic).
- [ ] Minimap has no building silhouettes yet.
