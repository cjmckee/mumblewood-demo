# Feasible food-variety reservations

The bot's meal reservations now distinguish an enabled recipe from a usable food source. A bread recipe without grain, flour or an owned upstream production route is not counted as makeable merely because a kitchen or oven lists it.

A meal remains eligible when its enabled recipe has a complete owned supply route, or when a complete batch can be made using actual warehouse, workshop or incoming ingredients. Already-stored meals remain eligible even without a producer, preserving the value of imported goods. Meals already meeting the charter's warehouse target are preferred before incomplete kinds, followed by feasible current production. Existing food-safety release rules remain in place.

`BOT.feasibleVariety` now defaults to true. This change is limited to the food-variety reservation plan. It does not rewrite every blueprint, recipe-selection or staffing heuristic, add a guaranteed crop route, change recipes or alter charter requirements. In the watched cases, the existing construction chain was able to pursue the missing food kind once reservations stopped displacing useful stored meals.

## Three closely watched pairs

The same three fixed seeds were replayed with current fine-material planning, spring recovery and one-serving tavern rules. All use the existing experimental recruitment taper and no grants. Controls and candidates have identical complete checkpoints at hour 6.

| Seed | Old reservations | Feasible reservations | Departures / deaths |
| --- | ---: | ---: | --- |
| 1000 | Won day 31.75 | Won day 31.75 | 0 / 0 |
| 8919 | Won day 54.38 | Won day 49.50 | 0 / 0 |
| 24757 | Won day 47.33 | Won day 47.33 | 0 / 0 |

The complete per-run reports for 1000 and 24757 match byte-for-byte. Their traces can still differ in reservations for nonexistent food; identical reports do not mean the policy made no different choices.

In 24757, the old planner reserves bread during 17 food-variety hourly observations despite having no grain, flour or field blueprint. That count falls to zero. The change does not alter this run's charter or completion times because the unavailable bread had no actual stock to consume.

In 8919, charter 2 completes on day 33.67 instead of 34.88, about 1.21 days earlier. For example, on day 30 the old policy protects pie, skewers and smoked fish while 24.1 stew is stored. Its scoring can let enabled alternatives displace that ready stock. The new policy recognizes the existing stew and smoked fish, protecting the latter while the pie route progresses. By day 31 the new policy retains 24.6 stew and 11.4 smoked fish while waiting for pie, instead of repeatedly falling back below the three-kind threshold. The eventual victory is 4.88 days earlier, but later events, construction and decisions diverge; not all of that difference is an isolated reservation-policy effect.

These are diagnostic cases, not a general win-rate or pacing estimate. No additional rate or difficulty tuning is justified by these three pairs alone.

## Checks and reproduction

`tools/variety-plan-check.ts` covers absent supply routes, owned routes not yet built, imported recipe ingredients, buffered ingredients, existing imported meals, release of a stale impossible-food ban, and emergency food access. TypeScript, build, fine-input planning, rough planks, tavern servings and workshop-buffer/control/save checks pass.

The runner follows current reservation defaults. Explicitly select the previous behavior for a paired replay:

```sh
VARIETY_PLANNING=legacy FORK_HOUR=6 FORK_POLICY=control WATCH=1 SEEDS=1000,8919,24757 RESULT_DIR=dist/variety/control npx tsx tools/combined-seasons.ts taper 3 90
VARIETY_PLANNING=legacy FORK_HOUR=6 FORK_POLICY=feasible-variety WATCH=1 SEEDS=1000,8919,24757 RESULT_DIR=dist/variety/candidate npx tsx tools/combined-seasons.ts taper 3 90
```

Artifacts: `/workspace/research-audit/variety-planning/`. Historical experiments predating this default need `VARIETY_PLANNING=legacy` if their old reservation strategy is required.

## Seasonal observation, without more runs

Follow-up: [winter food-route probes](winter-food-routes.md) compare ready fish, mushroom and grain chains, then check winter worker reassignment and a labeled cellar-blueprint access case. No food yield was changed.

Reusing the candidate traces, raw-food production at settlement/village standing is:

| Season | Observed hours | Berries | Fish | Fish share |
| --- | ---: | ---: | ---: | ---: |
| Autumn | 525 | 418.0 | 198.7 | 32.2% |
| Winter | 720 | 105.6 | 628.2 | 85.6% |
| Spring | 499 | 82.6 | 350.1 | 80.9% |
| Summer | 388 | 422.3 | 52.6 | 11.1% |

No other raw-food types were produced in these observations. The bots already shift between berries and fish across seasons. Winter's reduced foraging and spring's fishing bonus can therefore matter without adding preserves. This does not establish that fishing has the right output or that winter is appropriately difficult. All three cases have fishing access, and seasons differ in population, town standing, year and time before victory. Starting-camp observations are excluded; the figures are production, not a measure of what settlers actually ate.

The next balance investigation should inspect whether fishing is one useful winter option or a dominant solution, using a closely watched case with a genuinely different food route. Preserve the intended gentle seasonal curve and distinguish missing bot actions from weak incentives before changing yields.
