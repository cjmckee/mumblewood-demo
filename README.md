# Mumblewood

A comedic fantasy-frontier colony sim with roguelite drafting, inspired by Against the Storm and RimWorld.
Each run is one settlement: draft buildings and settlers, keep everyone fed and happy, and finish three
charters from the Crown before frontier strain wears the colony down.

## Run it

```sh
npm install
node build.mjs                 # writes dist/mumblewood.html, one self-contained page
npx tsx tools/harness.ts 200   # play 200 seeded bot runs headlessly and print balance stats
npx tsx tools/charters.ts 150  # how often the bot picks and finishes each charter, and how long it takes
npx tsx tools/forced.ts 30     # charter health check: force every charter in turn, with its top problems
npx tsx tools/diagnose.ts 100  # how often each known problem shows up, overall and per charter
npx tsx tools/diagnose.ts trace 3 20   # day-by-day status of one bot run
npx tsx tools/losses.ts 150    # fresh seeds: win rate, why settlers were lost, days per charter
npx tsx tools/moods.ts cheer 20   # where mood comes from on a forced charter, plus romance stats
npx tsx tools/review.ts 8 777 food   # read bot runs closely: choices, mood spread, why people leave, quality vs mood
npx tsx tools/wood.ts 20       # where wood and planks come from and go, and how much choppers actually chop
npx tsx tools/advise.ts 2       # what a player could conclude from the screen at a few moments in a bot game
npx tsx tools/economy.ts 60     # food, wood, laborers and mood over a run, winners vs losers
npx tsx tools/notes.ts 60       # notes bot vs rules bot on the same seeds: unresolved notes and why fixes fail
BOT_ADVISOR=1 npx tsx tools/losses.ts 150   # let the bot play from the on-screen complaints instead of its own rules (harness.ts honours it too)
npx tsx tools/variety.ts 80     # how different runs are: blueprint coverage, draft-to-built lag, events seen
npx tsx tools/recipes-check.ts  # multi-recipe engine: star preference, fallback, per-recipe toggles
npx tsx tools/routes-check.ts   # forces each drink route on a map with its site and checks the drinks come out
npx tsx tools/routes.ts 60      # which drink routes bot colonies use, by map sites; what gets built
npx tsx tools/reroll-check.ts   # blueprint reroll: 10, 20, 30 wood across the run; new options; refusals
npx tsx tools/pacing.ts 60     # when charters are picked and finished, research, population and strain by day
npx tsx tools/explain.ts 1000 1 20   # why the bot does what it does: each choice's options and score parts, staffing order, builds placed and skipped
npx tsx tools/explain.ts 1000 1 20 decision   # only the choices (also: staff, build)
STRAIN_K=0.05 RECRUIT_EXTRA=2 npx tsx tools/pacing.ts 50   # pacing takes experiment knobs: STRAIN_K, DRAFT_EVERY, RECRUIT_CAP, RECRUIT_EXTRA, LABORERS_PER, COMFORTS, COMFORTS_FIRST
npx tsx tools/trace.ts 1000 40   # day-by-day trace of one run (LOG=1 adds the log)
npx tsx tools/finale-check.ts   # forced checks: the small start, research, charter timing, strain, the Crown's Hall and the Long Table
node tools/save-check.mjs        # browser check of save and resume (build first): reload, continue, start over, old saves ignored
npx tsc -p .                   # type-check
```


Open `dist/mumblewood.html` in a browser. It works on phones too.

## Deploy

Every push to `main` builds the game and publishes `dist/site/index.html` to GitHub Pages
(`.github/workflows/pages.yml`). In the repo's Settings → Pages, set Source to "GitHub Actions".

## Layout

| Path | What it is |
| --- | --- |
| `src/sim/content.ts` | All game data: buildings, traits, charters, events, boons, research projects |
| `src/sim/scenario.ts` | How a run starts: settlers, goods, starting buildings, what's unlocked, the first research offer, strain, collapse rule. One start for now, kept as data so other starts (RimWorld-style) are easy to add |
| `src/sim/world.ts` | The deterministic simulation. No DOM, so it runs in Node too |
| `src/sim/economy.ts` | The ledger: last-24-hour income and use for food, wood, planks and ale, jobs and open slots, laborer time |
| `src/sim/advisor.ts` | Reads only what the player can see (thoughts, HUD, building cards) and ranks concerns with evidence and next steps |
| `src/sim/autoplayer.ts` | A heuristic bot used by the balance harness |
| `src/render/iso.ts` | PixiJS isometric vector renderer, which reads the world and never changes it |
| `src/ui/ui.ts` | HUD, bottom sheet, placement bar and decision cards. It changes the world only through commands |
| `src/main.ts` | Game loop, speed control and autosave |
| `src/save.ts` | Save and resume: a JSON snapshot of the world in this browser's storage. Bump `SAVE_VERSION` when a change to the world would make old saves play wrongly |
| `tools/harness.ts` | Headless balance harness |
| `tools/forced.ts`, `tools/charters.ts`, `tools/diagnose.ts`, `tools/issues.ts`, `tools/losses.ts`, `tools/moods.ts`, `tools/review.ts`, `tools/wood.ts` | Bot diagnostics: per-charter health, problem detectors, daily traces |

The UI changes the simulation only through `apply(world, command)`, so a future save file or replay
can simply be a seed plus a list of commands.

## UI verification

```sh
npm test                      # simulation and UI state suites
npm run check                 # TypeScript, all state suites, build
npm run build
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
# In another terminal:
npm run test:ui               # desktop, phone and small-phone browser regressions
CHROMIUM_PATH=/usr/bin/chromium UI_URL=http://127.0.0.1:8765/site/index.html node tools/save-check.mjs
```

Browser checks use Playwright available in the development environment. Set
`CHROMIUM_PATH` or `UI_URL` when using a different browser executable or local server.
Screenshots are written under `dist/ui-check`. See `docs/UI_IMPLEMENTATION.md` for
the polish commits and review screenshots.
## Phase 3: clothing and scenario settings

See [the clothing design and checks](docs/phase3-clothing.md) for both production routes, seasonal equipment, balance findings, and configurable starting date/colonist count. New games begin on summer 1.

The starting woodcutter can also rough-saw planks (3 wood each). Disable its wood-gathering recipe to select rough planks; a drafted sawmill is faster and cheaper. The bot uses a bounded early fallback and seeks efficient upgrades: see [bot production policy](docs/bot-production.md).

Workshops now provision complete recipe batches in shared input/output buffers. Recipe panels include priority controls and per-workshop warehouse stock targets. See [workshop logistics](docs/workshop-logistics.md) for behavior and measured trip counts.

Regular tavern service uses one small serving per settler each evening; guests continue socializing afterward, including when stock runs out. See [serving behavior and watched runs](docs/tavern-servings.md).

The bot now plans fine-material suppliers before the buildings they unlock, using bounded rough planks when needed. See [planning checks and watched cases](docs/fine-material-planning.md).

## Checks and merge checkpoint

Run `npm run check` for the type check, all focused simulation suites (each in a fresh process), and both browser builds. `npm test` runs just the simulation suites. Pull requests and pushes to main run the same checks in GitHub Actions.

See [the current merge checkpoint](docs/merge-readiness.md) for shipped defaults, final watched runs, save compatibility, and deferred polish/balance decisions. Older experiment notes record historical settings and should be read alongside that checkpoint.

For the browser save/resume check, install Playwright separately, serve `dist/site`, then run `GAME_URL=http://127.0.0.1:8000/ node tools/save-check.mjs`. `CHROMIUM_PATH` can select a system Chromium. The browser check is separate from the Node simulation suites.

For the UI playtest, follow [the playtest and follow-up plan](docs/UI_PLAYTEST_PLAN.md). It separates the shipped fixes from usability decisions awaiting playtest evidence.
