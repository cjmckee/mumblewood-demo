# Local food-chain and seasonal-needs investigation

## Identical-state source allocation comparison

Rather than compare whole-run outcomes after early choices diverged, replay wardrobe/24757 twice with unchanged policies until hour 1116 (day 47.5), then enable `BOT.chainGatherers` in only one continuation. Each process reaches the fork through its full original history, preserving internal bot caches and decision RNG. No world is loaded from a checkpoint or granted extra resources.

Both full checkpoint files (world, decision RNG and bot settings before activation) are byte-identical, SHA-256 `65d6faa674a23c15b36248555da0bc9941caf21a85de2a34395bba03bf3cd884`. All 1110 hourly observations through the fork also match exactly. The observation-only checkpoints are evidence of equivalence, not sufficient standalone save files for restoring bot caches.

The 96-hour window from day 47.5 to 51.5:

| Observation | Control | Source allocation enabled |
| --- | ---: | ---: |
| Fish gathered at dock | 0 | 38.74 |
| Smoked fish cooked at kitchen | 2.30 | 16.83 |
| Minimum total stored food | 92.3 | 87.3 |
| Food-variety charter | Still incomplete | Completed day 50.58 |

The short runs continue to day 53; the control still has not completed its food-variety charter. Its diagnostic timeout is the intentional observation cutoff, not a loss. The candidate's later charter is not the endpoint being tested.

Actual candidate actions:

- Day 48.58: Thaddeus Bramble picks up 4.06 fish at dock 49; day 48.67, delivers them to storage 29.
- Day 49.29: Ignatius Crumble picks up 4.4 fish from storage for kitchen 15; day 49.38, delivers them. At 1.1 fish per smoked fish, this is a complete four-output batch.
- Day 49.46: Gus Marrow picks up 4.05 smoked fish at kitchen 15; day 49.50, delivers them to storage 29.
- Day 50.58: the charter completes. The next hourly observation has 14.04 smoked fish, 25.36 stew and 11.19 pie in warehouse stock.

The control's small cooked quantity comes from fish already in the pipeline at the fork. Ingredient returns also occur in both continuations as recipes change; returns are recorded separately from incoming recipe supplies.

This supports a concrete local conclusion: losing the specifically requested dock assignment was preventing an otherwise functioning supply/production chain from progressing. It does not establish the policy's overall pacing benefit, and the earlier whole-run regression remains relevant. The source-allocation switch remains off by default while its scope is investigated.

## Why the bakery was making pie

At the exact fork the colony has a bakery but no field blueprint, no soil site, and zero grain and flour. It can make pie from available berries and wood, but cannot sustain a bread route from its owned production chains. The bakery falling back to pie is reasonable. Raising bread priority cannot create missing ingredients.

The bot's food-variety reservation scoring does, however, count enabled recipes as makeable without checking the upstream chain. This can include bread merely because a bakery has a bread recipe, even when its grain/flour route is unavailable. Charter-chain planning already applies stronger supply checks. Those two definitions should be reconciled in a future targeted bot experiment; this finding alone does not justify changing bakery rates, adding a guaranteed grain grant, or treating every hour without bread as a defect.

## Spring: available food versus qualifying food

In the no-grant taper/24757 run, all 240 first-spring hourly observations have at least one unit of raw berries/apples/fish per settler and at least one cooked meal per settler. Nevertheless, average spring freshness satisfaction is only 0.031. During spring the colony eats 68 stew and just two raw fish, with no eaten berries, apples or skewers in the monitored flows.

This follows current mechanics:

- Meal selection prefers cooked meals to raw food.
- Spring freshness requires eating berries, apples, raw fish or skewers within the preceding 72 hours.
- Stew and pie do not count, regardless of their ingredients. There is currently no ingredient-freshness provenance on cooked meals.

That means low spring freshness in this case is not a gathering shortage. It is a mismatch between automatic meal choice and a seasonal condition. The user subsequently rejected both freshness approaches because food freshness is not actually modeled. The adopted replacement is [spring recovery with existing wet-weather tradeoffs](spring-recovery.md); no ingredient provenance was implemented. The observations in this section describe the historical fresh-food rule.

## Summer: supply and access explain much of the variation

Using only summer observations at settlement/village standing:

| Case | Observed hours | Drink need satisfaction | Hours with at least one warehouse drink |
| --- | ---: | ---: | ---: |
| Taper / 24757 | 240 | 0.124 | 4 |
| Wardrobe / 24757 | 240 | 0.741 | 84 |
| Taper / 1000 | 30 | 0 | 0 |

The taper/24757 brewery is not built until day 46.33, more than halfway through that summer, and is staffed in only 75 of 240 observations. In wardrobe/24757, the brewery is staffed in 228 observations and the tavern in 219. Both use the brewery's existing berry-to-ale fallback; neither has a staffed grain or honey gatherer. Drink consumption and recent consumption credit work in the watched cases. Higher satisfaction in the wardrobe case is not evidence of a direct coat benefit: buildings, choices and production trajectories differ.

The taper/1000 run wins early in spring, so its 30 summer observations are from its initial settlement-standing period before autumn, not a later full summer. Its zero must not be compared as ten days of second-summer exposure.

The next summer experiment should address when a feasible drink route is built and staffed, then watch deliveries and evening access. The present evidence does not justify increasing drink output or weakening the seasonal need.

## Reproduction

Run separate processes, keeping `CHAIN_GATHERERS` unset so neither policy changes before the fork:

```sh
SPRING_FRESH=1 FORK_HOUR=1116 FORK_POLICY=control WATCH=1 SEEDS=24757 RESULT_DIR=dist/local-food/control npx tsx tools/combined-seasons.ts wardrobe 1 52
SPRING_FRESH=1 FORK_HOUR=1116 FORK_POLICY=source WATCH=1 SEEDS=24757 RESULT_DIR=dist/local-food/source npx tsx tools/combined-seasons.ts wardrobe 1 52
```

`FORK_HOUR` writes a pre-intervention checkpoint. `FORK_POLICY=source` enables only the source allocation policy afterward. Full local traces and checkpoints are retained in `/workspace/research-audit/local-food/{control,source}/`; the spring/summer audit reuses the previously watched baselines rather than claiming new independent runs.
