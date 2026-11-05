# NEON CITY + NEON HQ

Two original games in one Vite project:

- **NEON CITY** (`/`) — an open-world driving mini game with an intentional early-2000s look (low-poly, diffuse textures, blob shadows, heavy fog, wet night roads) in a golden-hour European-style city with a full day-night cycle. Walk, take any car, do jobs across town (deliveries, taxi runs, street races), shake off the police when your wanted level climbs, grab a bike, climb the stairs to the viaduct and surf the train, or take the fire escape up to a rooftop. Three.js with sun shadows, bloom, ambient occlusion (High), film grade, speed blur and real headlights. Keyboard (WASD / arrows, Space drift, E enter/take car, H horn, C camera, R reset) and touch controls. `?q=high|balanced|battery` forces a quality tier, `?hour=17.3` a time of day, `?filter=crisp` nearest-neighbour textures. Space jumps, vaults low obstacles and climbs ledges on foot.
- **NEON HQ** (`/hq.html`) — a startup-tower management game. Hire workers, build and upgrade rooms, pay bonuses, answer events, call meetings and grow from $650 to a million.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve dist/ on :4173
```

## Checks

```bash
npm run check      # typecheck + lint + unit tests
npm run e2e        # Playwright (builds and serves dist/ itself)
npm run balance -- --policy=greedy --seed=42   # 30-day economy run
```

## Deploy

The app is a static Vite build plus one serverless function (`api/chat.ts`) for optional AI chat replies. On Vercel, import the repository and set `ANTHROPIC_API_KEY` in the project's environment variables; without it the game uses its scripted in-character replies. The key is only read on the server.

## Layout

- `src/city` — NEON CITY: world generation, vehicle physics, player, traffic, missions, HUD, post-processing, audio
- `src/game` — deterministic simulation (economy, workers, events, milestones, chat, save)
- `src/render` — PixiJS scene: sky, city, building, workers, camera, post-processing, quality tiers
- `src/ui` — HUD, panels, modals, toasts, effects, tutorial
- `src/audio` — Web Audio effects, ambience and music
- `src/styles/tokens.css` — the design tokens
- `scripts/balance.ts` — economy balance script
- `tests/`, `e2e/` — Vitest and Playwright suites

See `AUDIT.md` for the polish audit and `CHANGELOG.md` for what changed.
