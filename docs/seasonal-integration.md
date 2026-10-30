# Seasonal integration findings

See [the merge checkpoint](merge-readiness.md) for the current implementation and final-default validation. The experiment and next-step sections below are historical; linked follow-up investigations record the subsequent work.

## Design direction

Current spring rule: the fresh-food comfort requirement is disabled. [Spring recovery](spring-recovery.md) records the paired comparison and retained weather effects. The original results below used the historical requirement; reproduce those with `SPRING_FRESH=1`.

Preserves/pickling are deferred. Seasonal requirements should differ, with a gentle difficulty rise from starting summer through autumn into winter, followed by relief through spring and summer. A new chain should earn its place through a meaningful choice, rather than extra economic activity or compensating for a punitive winter. These tests leave seasonal mechanics and numerical balance unchanged.

## Experiment

`tools/combined-seasons.ts` runs four fixed seeds (1000, 8919, 16838, 24757), starting summer 1, with a 90-day ceiling. All use current complete-recipe batching and the bounded rough-plank bot fallback.

- `current`: current default recruitment and bot policies.
- `taper`: recruitment intervals multiply by 2 at population 10 and by 4 at 13. This is an experimental process-local setting, not a shipped default or population cap.
- `prepared`: taper plus optional clothing deadline and construction-material reservation policies.
- `wardrobe`: prepared plus starting knowledge of trapper, tannery and tailor. No buildings, workers or materials are granted. This deliberately tests access to a viable clothing route; it is not an ordinary draft outcome.

Final results, after the interrupted-meal fix:

| Seed | Current: win day / population | Taper | Prepared | Wardrobe |
| --- | --- | --- | --- | --- |
| 1000 | 52.58 / 16 | 31.75 / 14 | 31.75 / 14 | 48.71 / 16 |
| 8919 | 42.62 / 17 | 52.46 / 16 | 52.46 / 16 | 54.46 / 16 |
| 16838 | 48.58 / 16 | 53.75 / 16 | 53.75 / 16 | 46.38 / 15 |
| 24757 | 50.38 / 17 | 53.42 / 16 | 53.42 / 16 | 73.62 / 16 |

All 16 cases won with no departures or deaths. The prepared cases reproduce taper exactly: neither makes or equips coats. Clothing policy alone is insufficient when the route is not available/built. Wardrobe cases produce approximately 6–17 coats and record 3–15 equipment pickups. Some pickups happen in the second winter; these totals do not measure first-winter readiness or simultaneous coverage.

Taper ends at 14–16 settlers rather than 16–17. Three seeds finish later; one finishes much earlier. The sample does not support a uniform pacing cost or guarantee a 15-pawn ceiling. Comparisons share initial seeds but later random events, drafts and decisions diverge as simulation actions change.

## Seasonal pressure

We separate observations by both season and town standing, because charter completion changes the needs being measured. Hour-weighted observations in the taper cases:

| Season / standing | Observed hours | Average comfort | Seasonal need satisfaction |
| --- | ---: | ---: | ---: |
| Autumn / settlement | 532 | 0.764 | No extra comfort need |
| Winter / settlement | 590 | 0.880 | Warmth 1.000 |
| Spring / settlement | 333 | 0.726 | Fresh food 0.139 |
| Winter / village | 370 | 0.801 | Warmth 1.000 |
| Spring / village | 406 | 0.694 | Fresh food 0.158 |
| Summer / village | 710 | 0.735 | Drinks 0.180 |

These bots keep beds and fuel supplied: all sampled taper winter pawn-hours are warm, even without coats, and food never falls below the diagnostic two-units-per-person threshold. This does not measure every travel cost or prove that winter is easy for humans. Coats still reduce illness risk for heated settlers, so zero cold exposure does not mean zero clothing benefit.

Spring fresh food and summer drinks are much less satisfied. The current seasonal comfort curve therefore does not demonstrate the intended winter peak and spring/summer relief. Even at the same standing, populations, buildings, year and time spent in a season differ; these are diagnostic observations, not a controlled ranking of intrinsic season difficulty. Runs stop at victory, so later unobserved seasons are not counted as successes.

Existing mechanics already distinguish seasons: summer's longer workday and some gathering bonuses; autumn harvest bonuses, faster spoilage and harvest festival; winter crop shutdown, reduced gathering, fuel and illness; spring fresh-food demand, partial crop recovery and wet-ground penalties. A missed autumn festival currently imposes its mood penalty **when winter arrives**, adding to winter's other demands rather than making autumn itself harder.

## Individual actions and a simulation correction

The wardrobe/16838 run originally lost Marigold Bunt to hunger on day 27 while food remained available. Daily action inspection showed an unfinished meal containing fish, `until: 0`, while her activity was `sick`. Becoming bedridden during a meal trip prevented table arrival, while the outstanding meal prevented starting bedside feeding. This was a state-transition defect, not evidence of inadequate food production.

The simulation now completes an interrupted meal using its existing bedside-feeding rules. Already collected food is retained and not consumed twice; uncollected meals use normal food selection; no food means no invented meal. `tools/bedside-meal-check.ts` covers all three cases. All 16 cases were rerun after the correction. Earlier completion times are superseded; this fix also changes some later random outcomes in runs that did not lose anyone.

The final wardrobe/24757 case completes charter 1 on day 19.79 and charter 2 on day 63.54. Noon snapshots repeatedly show only 1–2 of the required 3 meal kinds above ten units, despite adequate total food and mood above its charter requirement. On day 50.5 the kitchen is unstaffed and reports missing fish, while the dock is also unstaffed; bakery and pie oven have workers. This identifies a concrete recipe/supply/staffing investigation. It does not prove that simply assigning the dock once would resolve the entire delay. Many other runnable buildings are intentionally unstaffed in a small colony; an idle building alone is not a bot defect.

## Next experiment

The first three closely watched replays and an opt-in source-allocation experiment are documented in [watched food runs](watched-food-runs.md). They expose a specific ingredient-source mismatch, but mixed completion times mean the experimental policy remains off by default.

Trace the food-variety bottleneck and seasonal fresh-food/drink choices on these same seeds, then compare one targeted bot policy using workshop recipe priorities and warehouse stock targets. Inspect individual supply trips and work assignments around failures before changing production rates. Keep clothing optional, retain the no-grant control, and label granted-route diagnostics separately. Evaluate seasonal fulfillment and charter time as well as wins.

Only after that audit should we tune the seasonal envelope toward summer ease, autumn preparation, a manageable winter peak and spring recovery. Do not add preserves or increase winter punishment to compensate for missed bot actions. Draft accessibility for optional clothes is a separate question from coat recipe speed.

## Reproduction and validation

Run each mode in a fresh process:

```sh
RESULT_DIR=dist/combined-seasons npx tsx tools/combined-seasons.ts current 4 90
RESULT_DIR=dist/combined-seasons npx tsx tools/combined-seasons.ts taper 4 90
RESULT_DIR=dist/combined-seasons npx tsx tools/combined-seasons.ts prepared 4 90
RESULT_DIR=dist/combined-seasons npx tsx tools/combined-seasons.ts wardrobe 4 90
```

Per-seed JSON includes charter milestones, daily needs/stocks/staffing, diagnostic action flags, the final bounded game log, and summaries by season and season/standing. Endpoint observations weight elapsed hours; season-boundary allocation is approximate within one hourly sample. Season totals and stratified totals were checked against elapsed simulation time. Repeated instrumentation runs are not independent samples.

Validation: TypeScript, build, bedside-meal regression, clothing/calendar/save checks, workshop buffer/control/save checks, and all 16 combined scenarios. Detailed task artifacts are in `/workspace/research-audit/combined-seasons/final/`; pre-fix diagnostic artifacts are in its sibling `before-meal-fix/` directory.
