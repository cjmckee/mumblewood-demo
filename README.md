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
npx tsc -p .                   # type-check
```

Open `dist/mumblewood.html` in a browser. It works on phones too.

## Layout

| Path | What it is |
| --- | --- |
| `src/sim/content.ts` | All game data: buildings, traits, charters, events, boons |
| `src/sim/world.ts` | The deterministic simulation. No DOM, so it runs in Node too |
| `src/sim/autoplayer.ts` | A heuristic bot used by the balance harness |
| `src/render/iso.ts` | PixiJS isometric vector renderer, which reads the world and never changes it |
| `src/ui/ui.ts` | HUD, bottom sheet, placement bar and decision cards. It changes the world only through commands |
| `src/main.ts` | Game loop and speed control |
| `tools/harness.ts` | Headless balance harness |
| `tools/forced.ts`, `tools/charters.ts`, `tools/diagnose.ts`, `tools/issues.ts`, `tools/losses.ts`, `tools/moods.ts` | Bot diagnostics: per-charter health, problem detectors, daily traces |

The UI changes the simulation only through `apply(world, command)`, so a future save file or replay
can simply be a seed plus a list of commands.
