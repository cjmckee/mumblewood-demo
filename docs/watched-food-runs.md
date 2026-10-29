# Closely watched food-production cases

## Method

Use a handful of fixed cases until core actions are credible. This investigation replays three existing cases with hourly observations of recipe selection, ingredient/output buffers, warehouse stocks, food restrictions, worker assignments, staffing explanations, actual time at work, and individual pickup/drop transitions. It does not introduce seasonal or recipe balance changes.

`WATCH=1` in `tools/combined-seasons.ts` adds a separate trace. `SEEDS=...` selects exact cases instead of increasing the sample. Watching all three baselines reproduced their previous complete reports exactly, so the added observations did not change their outcomes. Hourly work totals sample each tick; pickup/drop records describe carrying transitions and should not be interpreted as all travel. A canceled task can also end a carrying state.

Cases: wardrobe/24757 (long food-variety stall), taper/24757 (same seed, no blueprint grant), and taper/1000 (faster comparator). Wardrobe retains its explicitly granted clothing blueprints; neither case grants goods or workers. Recruitment taper remains process-local.

## A concrete staffing defect

In wardrobe/24757, the bot's own charter plan explicitly requested `dock → kitchen`, but allocation grouped docks with foragers as `rawFood`. The final assignment distributed those workers by building efficiency, losing the identity of the ingredient source the plan requested. Higher-efficiency foragers could therefore receive every worker while the kitchen waited for fish. Total raw-food quantity hid the missing ingredient.

Across this run's food-variety charter, 286 hourly observations included a built but unstaffed dock in the requested chain. At day 48.25, the baseline had about 143 food, 49 stew and 15 pie, but less than one fish and zero warehouse smoked fish or bread. Its kitchen and dock both had zero workers. This is an actionable bot mismatch, not evidence of a general food shortage or insufficient recipe output.

Individual trips were also inspected: on day 47.33, Percival Wimble picked up 3.3 fish at storage for kitchen 15. The kitchen's smoked-fish recipe needs 1.1 fish per output, so this was a complete three-output ingredient batch. The observed problem was not orphan ingredients being fetched without a complete recipe.

## Isolated candidate

An opt-in `BOT.chainGatherers` policy preserves one worker for each available raw-food gatherer in the requested charter chain before distributing remaining allocated workers by efficiency. It uses the existing worker budget and leaves famine allocation unchanged. It does not create jobs, change production rates or grant materials. The switch remains **false by default**.

| Case | Baseline win day | Candidate win day | Baseline / candidate charter-2 completion |
| --- | ---: | ---: | ---: |
| Wardrobe / 24757 | 73.62 | 62.50 | 63.54 / 50.29 |
| Taper / 24757 | 53.42 | 44.33 | 41.42 / 19.83 |
| Taper / 1000 | 31.75 | 58.58 | 18.79 / 50.58 |

All six replays won with no deaths or departures. These are three paired diagnostic cases, not six independent samples or evidence of a general win rate.

In the wardrobe case, the 286 observations of a requested but unstaffed dock fell to zero. At day 48.25 the candidate assigned Bertha Quigley to the dock, which had accumulated 8.71 fish in its output buffer; the kitchen was still waiting for ingredients. Charter 2 completed about 13 days earlier, but this is a whole-run observation, not an isolated causal estimate for every day saved.

The fast comparison seed regressed substantially and chose a different later charter trajectory: its baseline never selected the menu charter, whereas the candidate spent 988 hourly observations on it. Both positive and negative whole-run results include downstream changes in decisions and random events. Do not promote the policy on aggregate completion times alone, and do not discard the slower comparator.

## Next controlled comparison

Completed: [local food and seasonal-needs investigation](local-food-investigation.md) verifies identical pre-intervention states, follows the working fish chain, and distinguishes the bakery fallback from unavailable bread ingredients. It also audits spring freshness and summer drink access.

Replay from an identical stalled state just before the requested dock loses its worker, enabling the candidate only at that point. Inspect the sequence of assignment → gathering → output hauling → complete-recipe supply → kitchen work → warehouse smoked fish. Keep the comparison focused on that local action chain before assessing later win time.

After source selection is credible, trace why the bakery keeps making pie while bread is missing, and how food rules protect the requested meal kinds. Then audit spring fresh-food and summer drink choices using the same small case set. Recipe priorities and warehouse targets are available tools, but this experiment does not yet change them. Preserves remain deferred, and the intended gentle seasonal curve remains the balance goal.

## Reproduction

These historical cases used the fresh-food requirement. Run modes in separate processes with `SPRING_FRESH=1` to reproduce them:

```sh
SPRING_FRESH=1 WATCH=1 SEEDS=24757 RESULT_DIR=dist/watched-food/baseline npx tsx tools/combined-seasons.ts wardrobe 1 90
SPRING_FRESH=1 WATCH=1 SEEDS=24757,1000 RESULT_DIR=dist/watched-food/baseline npx tsx tools/combined-seasons.ts taper 2 90
CHAIN_GATHERERS=1 SPRING_FRESH=1 WATCH=1 SEEDS=24757 RESULT_DIR=dist/watched-food/candidate npx tsx tools/combined-seasons.ts wardrobe 1 90
CHAIN_GATHERERS=1 SPRING_FRESH=1 WATCH=1 SEEDS=24757,1000 RESULT_DIR=dist/watched-food/candidate npx tsx tools/combined-seasons.ts taper 2 90
```

Focused regression: `npx tsx tools/chain-gatherers-check.ts` demonstrates the lost dock assignment, preserves worker budget, and checks famine/no-charter behavior. TypeScript, build, recruitment, clothing-bot and workshop-buffer/control/save checks pass. Detailed task artifacts are in `/workspace/research-audit/watched-food/{baseline,candidate}/`.
