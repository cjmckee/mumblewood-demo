# Fine-material construction planning is now enabled

The bot now accounts for fine materials needed by planned charter buildings before those construction sites exist. It can use the existing bounded rough-plank recipe to get started. When an owned fine-material workshop needs another producer, that supplier can be built as part of the charter's indirect construction chain instead of being held behind the building it would unlock.

The bot selects one owned fine-material route rather than prioritizing all interchangeable alternatives. Existing workshops and sites are favored, followed by routes needing fewer new buildings. Missing blueprints and unsuitable ingredient sources are not treated as available production. A carpenter can use its wood-to-planks fallback without an invented reed supply. Immediate shelter, raw food, storage and first basic-service construction retain precedence.

`BOT.plannedRoughDemand` and `BOT.fineInputs` now default to true. This promotes bot planning fixes, not resource grants or recipe buffs. The wood start/stop thresholds and hourly soft rough-work budget are unchanged. Source-specific gatherer assignment, summer service/banking policies, clothing deadline/reservation and other optional experiments remain off by default.

## Three closely watched cases

Three fixed seeds were replayed with current spring recovery and one-serving tavern rules. All use the same experimental recruitment taper, without granted blueprints, workers or goods. Each control/candidate pair has an identical full checkpoint at hour 6; intervention begins before the first bot action. The candidate enables the two planning fixes together.

| Seed | Old planning | New planning | Losses |
| --- | --- | --- | --- |
| 1000 | Won day 31.75, 14 settlers | Won day 31.75, 14 settlers | None |
| 8919 | Won day 54.38, 16 settlers | Won day 54.38, 16 settlers | None |
| 24757 | Still playing at day 91, 16 settlers | Won day 47.33, 16 settlers | None |

The complete per-run JSON reports for seeds 1000 and 8919 match byte-for-byte across policies. This is stronger than merely matching completion time: their recorded milestones, stocks, flags, seasonal summaries and bounded game logs are unchanged.

In seed 24757, old planning completes the first charter on day 12.54, then stalls on food variety through the 90-day observation ceiling. The new planner follows this observed sequence:

- First rough planks are produced on day 17.33.
- Rufus Larder physically hauls the early planks out of the woodcutter.
- Alfie Crumble picks up eight planks for the pie-oven site on day 18.29.
- The pie oven completes by day 18.46; the food-variety charter completes on day 22.42.
- A drafted sawmill completes on day 27.54 and begins producing on day 27.71.
- The run wins on day 47.33.

Total rough production is 13.38 planks; the existing nominal 12-plank budget is checked hourly and permits a small overshoot. The sawmill subsequently produces about 294.44 planks. The planner does not remain on the expensive fallback. The control and candidate both first reach zero wood on day 9.25, before the changed behavior begins, and both have zero sampled winter cold exposure. This does not claim that stock safety is perfect throughout every run.

A clay pit and kiln are also built later in the candidate run; selecting one route for immediate dependency planning does not prohibit the ordinary bot from later building another owned workshop for a different purpose. It prevents the dependency exception itself from requesting every alternative at once.

These are three diagnostic cases, not a win-rate estimate or a general pacing target. Later drafts, events and charter choices diverge in the repaired case. The supported conclusion is removal of an observed dependency loop without changing the two contrasting replays.

## Reproduction

The probe follows current bot defaults unless `FINE_PLANNING=legacy` is specified. Use that explicit override on both sides to reproduce the pre-fix start:

```sh
FINE_PLANNING=legacy FORK_HOUR=6 FORK_POLICY=control WATCH=1 SEEDS=1000,8919,24757 RESULT_DIR=dist/fine-planning/control npx tsx tools/combined-seasons.ts taper 3 90
FINE_PLANNING=legacy FORK_HOUR=6 FORK_POLICY=fine-planning WATCH=1 SEEDS=1000,8919,24757 RESULT_DIR=dist/fine-planning/candidate npx tsx tools/combined-seasons.ts taper 3 90
```

Normal runs need no planning flags. Historical comparison commands that assumed these switches were off also need `FINE_PLANNING=legacy` when replayed against current code. Older seasonal and repeated-drinking investigations describe their historical mechanics and archived results.

Validation: TypeScript, build, rough-plank, fine-input route selection/construction, construction reservation, specific gatherer assignment, summer-service, tavern-serving and workshop-buffer/control/save checks. Detailed task artifacts: `/workspace/research-audit/fine-planning/`.

## Next direction

Completed: [feasible food-variety reservations](food-variety-planning.md) are now enabled after the three paired replays. The investigation also records the observed seasonal food-source shift. The paragraphs below describe the motivation for that audit.

Audit food-variety recipe priorities and reservations as one coherent plan. In the earlier trace, a bakery's enabled bread recipe was counted as makeable without a grain/flour route, while another planner already recognized that the ingredients were unavailable. Reconcile that feasibility check before changing production rates or charter targets. Continue with a small watched case set and preserve the cases that are already working.
