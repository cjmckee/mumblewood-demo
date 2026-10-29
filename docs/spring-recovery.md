# Spring recovery instead of a fresh-food checklist

## Current decision

The proposed cooked-food provenance change was withdrawn before implementation. The game does not model the age or freshness of individual food items. Spring no longer adds the `fresh` comfort requirement by default, and no ingredient-history tracking was added.

Spring's identity comes from its existing weather and production rules:

- Winter home heating and cold exposure end.
- Fields and orchards resume at 40% of normal output; foraging and herbs recover to 80%.
- Fishing runs at 125% output.
- Off-path movement and construction remain at 85% speed, making roads and building preparation useful.

No replacement consumption need, new illness penalty, recipe, resource or production-rate change was introduced. The seasonal help text explains recovery and wet-weather logistics. The old `fresh` rule remains available only as a scenario comparison setting (`START.seasons.springFresh = true`), with the normal setting false. Existing saves use the current rule automatically; their goods and meal histories are preserved.

## Closely watched comparison

Two already-investigated cases, taper/24757 and wardrobe/24757, were replayed to hour 720 (spring day 1). For each pair, full pre-intervention world, bot settings, seasonal settings and decision RNG checkpoints match byte-for-byte. One continuation keeps the old requirement; the other disables it. Neither enables the experimental gatherer policy. Each continues through the spring observation window and stops at the start of summer, rather than treating an intentional cutoff as a loss.

| Case | Average spring comfort: old → recovery | Minimum stored food: old / recovery | Ending population: old / recovery |
| --- | ---: | ---: | ---: |
| Taper / 24757 | 0.710 → 0.879 | 396.3 / 396.3 | 15 / 15 |
| Wardrobe / 24757 | 0.735 → 0.864 | 36.6 / 36.6 | 14 / 14 |

Each value summarizes 240 hourly endpoint samples from just after hour 720 through hour 960; the last is the summer boundary. These are two paired cases sharing a map seed, not four independent samples.

Before later events diverged, strain accumulated more slowly with recovery. End-of-spring strain was nevertheless higher in both recovery continuations (12.325 vs 11.356, and 7.940 vs 7.707), because event relief and festival timing differed. For example, the taper control received letters and author-reading relief that the candidate did not; the wardrobe control held a festival while the candidate did not. We therefore do not claim that removing the requirement necessarily improves final strain, mood or completion time. The supported result is removal of the low-food-variety penalty from an otherwise well-fed spring, while existing weather tradeoffs remain.

This is a clearer baseline for the desired gentle seasonal cycle. It does not establish that winter is the hardest season or that the full curve is already balanced. Autumn's festival timing, winter's stacked modifiers, and summer's drink access remain separate investigations.

## Following investigation

[Summer drink access](summer-drinks-investigation.md) exposes construction dependency loops and a subsequent choice between tavern service and finale stockpiling. Experimental planning policies remain off by default.

## Reproduction

The comparison explicitly enables the historical requirement before the fork, even though the current game default is off:

```sh
SPRING_FRESH=1 FORK_HOUR=720 FORK_POLICY=control WATCH=1 SEEDS=24757 RESULT_DIR=dist/spring-recovery/control npx tsx tools/combined-seasons.ts taper 1 40
SPRING_FRESH=1 FORK_HOUR=720 FORK_POLICY=spring-recovery WATCH=1 SEEDS=24757 RESULT_DIR=dist/spring-recovery/recovery npx tsx tools/combined-seasons.ts taper 1 40
```

Repeat with `wardrobe` for the granted-clothing-route case. The runner restores its initial spring setting for each seed so an intervention cannot leak into a later case. `SPRING_FRESH=0` explicitly selects recovery; leaving it unset follows the current scenario default.

`tools/spring-recovery-check.ts` checks all seasons and standings, the legacy comparison, and retained spring work/yield/weather rules. TypeScript, build, clothing/calendar/save, bedside-meal and gatherer-allocation regressions pass. Detailed local traces and checkpoints are retained in `/workspace/research-audit/spring-recovery/`.
