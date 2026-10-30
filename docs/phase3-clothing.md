# Phase 3: warm clothes

For the current merge scope, defaults, validation and deferred work, see [the merge checkpoint](merge-readiness.md). Investigation sections below record decisions at the time; later findings supersede earlier experimental recommendations.

## Current bot and recipe defaults

[Feasible food-variety reservations](food-variety-planning.md) are enabled by default; this changes bot food planning without changing recipe rates or charter costs.

[Fine-material dependency planning](fine-material-planning.md) is now enabled by default; earlier experiment sections describing those two switches as opt-in are historical.

The rough-plank prototype is now real player content at the starting woodcutter. The bot uses a bounded fallback by default: one hut, 3 wood per plank, wood start/stop bands 35/20, and a roughly 12-plank early budget checked hourly. It returns to gathering and favors a usable drafted fine-material upgrade. Players can choose the recipe independently through the normal recipe toggles. Small rough batches are hauled from one unit so the budget cannot strand material below the usual four-unit threshold.

All four ordinary fixed-seed bot runs won (about days 42–48). The eight granted-route comparisons expose a trade-off: bounded rough work limits expensive wood use but does not always finish faster. See [bot production policy](bot-production.md) for current behavior. Earlier experiment sections below record the historical investigation; their “prototype only” and older buffer descriptions are superseded by this section. Other experimental goal/research/population switches remain off by default.

This is the first slice of the historical “Warm clothes and preserves” phase. Preserves/pickling are deferred: the current design direction is distinct seasonal needs with a gentle summer → autumn → winter rise and spring → summer relief, rather than another chain added solely to make winter survivable. Charcoal and family housing remain candidate work; individual wants/luxuries are Phase 4. See [seasonal integration findings](seasonal-integration.md) before selecting the next phase. The historical design is context, with the following decisions from this implementation taking precedence.

## Current decisions

Spring now uses [recovery and wet-weather logistics](spring-recovery.md), without a fresh-food requirement or cooked-food provenance system.

- Both routes produce interchangeable **warm clothes**: flax field → weaver → tailor, and trapper → tannery → tailor. Flax needs good soil and does not grow in winter; trapping continues at reduced winter yield. Existing hauling, storage and recipe controls apply.
- Clothes are optional protection, not a new standing/comfort requirement. A coat halves the cold mood penalty and winter chill risk; it does not heat an unfuelled home, remove the cold state, or replace a bed.
- Settlers physically collect a personal coat from storage in winter. Outside winter they hang it at a storage and retrieve the same coat next winter. Personal stored coats retain their condition, remain owned by that pawn, and are separate from unclaimed goods available for trade. If that storage is removed or wrecked before retrieval, the stored coat is lost.
- Lifetime is initially **40 days of wear**, controlled by CLOTHING in content.ts. Storage pauses wear. This can therefore last roughly four ten-day winters, rather than expiring after one calendar year. Exact lifetime, production rates and protection are provisional balance parameters.
- New goods have icons and prices, buildings have map models, and a clothier sells materials, clothing and relevant blueprints. Buildings use the existing blueprint draft system.
- Pawn cards show whether a coat is worn or stored and its remaining wear life. Save/resume preserves personal coat ownership, storage location and durability. Existing saves receive zero new goods and retain their original summer-6 calendar.

## Starting date

New games default to **summer 1**, giving 20 days until winter starts on run day 21. Starting colonists and date can be set in scenario.ts or per world:

```ts
createWorld(1234, {
  colonists: 5,
  startDate: { season: 'spring', day: 3 },
});
```

The day is 1–10 and season is spring/summer/autumn/winter. Each world stores its own startDate, so later default changes do not shift a saved colony's seasons or caravan calendar. These are scenario/API settings; no new start-options screen is included.

## Verification

- `npx tsx tools/clothing-check.ts`: both full material routes, consumption, unique personal ownership, seasonal pickup/storage/retrieval, wear/expiry, cold mood and illness protection, fuel still required, calendar configuration and save migration.
- `npx tsx tools/clothing-pacing.ts natural 4`: four fixed seeds with normal blueprint access.
- `npx tsx tools/clothing-pacing.ts textile 4` or `leather 4`: scenario grants only the route's blueprints; buildings, materials and workers must still be obtained normally. Textile runs without good soil are explicitly unsuitable for that route, not successful textile tests.
- Existing simulation suites, type check, build and browser save/resume checks remain relevant. Browser equipment checks also exercised worn/stored pawn cards and personal coat persistence with no page errors.

## Initial findings and next measurement

A supplied ten-day fixture with two workers per stage produced about 48.2 textile coats or 37.3 leather coats. It tests working chains; abundant food/material support and six specialists make it unsuitable as an ordinary colony throughput target.

Ordinary bot play is much more constrained. Four natural runs won around days 42–48; only one equipped coats (three bought through trade). Granting leather blueprints produced clothes in three of four cases after a staffing correction; the textile case with good soil produced flax and cloth but finished without coats. Consequently, do not infer an economic balance recommendation from those outcomes. The next diagnostic is the textile route's late-stage staffing/delivery timing and the value of cold protection in a well-fuelled colony.

Bot policy follows one owned clothing route, reserves one specialist near winter only when food reserves and population allow it, keeps food/wood essentials, and can buy coats with a gold reserve. Earlier behavior built clothing workshops without staffing them; the pacing results identified that problem. The policy is a first pass, not an optimal human pacing target.

Recruitment taper experiments from the preceding work remain optional and were not silently enabled here. These clothing runs also have a different calendar and trader/blueprint pool from previous experiments; their finish days are not a controlled estimate of clothing's effect alone.

## Follow-up: why the textile bot makes cloth but no coats

The detailed seed-8919 trace reproduced the existing textile scenario's day-47.625 win. Its field completed on day 2.71, weaver on day 28.50, and tailor on day 45.33. Stored flax peaked at 128.26; the field produced 150.16 overall. Cloth production was 9.14, and coat production zero. The tailor was not ready for winter 1 (day 21), and the run ended before winter 2 (day 61). That is primarily late pipeline construction, not evidence that a tailor's recipe is too slow.

`tools/clothing-trace.ts` now records construction availability, material stocks/inboxes/outboxes, staffing requests and assignments, recipe inputs, blockers and seasonal yield. `tools/clothing-pacing.ts` accepts `SEEDS=...` and `BOT=...`, and reports first production, first tradeable stock, first equipment and first-day winter coverage separately. Warm-season storage must not be mistaken for an equipment failure.

Two candidate policies were investigated:

1. **Wait until the entire chain is built before harvesting.** This removed premature flax accumulation, but reduced leather coverage. Rejected as a default.
2. **Prime one coat's worth of inputs while the chain is incomplete, then batch to remaining pawn demand.** This counts stock, workshop inboxes/outboxes and finished coats awaiting hauling. It reduces waste but did not consistently improve winter coverage or win timing. It remains opt-in as `BOT.clothingBatch`, default false. Ten focused checks in `tools/clothing-bot-check.ts` cover missing stages, priming limits, stage order, delivered inputs and finished output.

A conservative construction-priority bypass was also tried on seed 8919 and had no effect; it was removed. No recipe rates, material costs, coat protection or default construction priorities were changed by this investigation.

For a valid textile sample, the first four soil-equipped seeds in the existing sequence were selected by terrain alone: 8919, 32676, 40595 and 64352. This avoids treating three unsuitable maps from the original four-seed set as textile failures. Current and candidate policy results and traces are retained under `/workspace/research-audit/clothing/` in this task's workspace. These are small diagnostic samples, not population balance estimates.

The next design experiment should give optional winter preparation an explicit completion deadline and measure its opportunity cost against the active charter. A larger production buff would not solve the observed problem of not constructing the tailor until after winter.

### Explicit first-winter objective experiment

`BOT.clothingDeadline` (default false) lets a fed, housed colony of six or more prioritize a three-coat batch during the fifteen days before winter. The paired study covers four soil-equipped textile scenarios and four leather scenarios, granting blueprints only. Both ordinary and candidate policy met the strict target—three coats in storage before day 21—in only one of eight cases, on different seeds. It remains experimental rather than a default improvement.

Seed 8919's candidate weaver/tailor finish on days 25.46/27.46, earlier than the ordinary policy but still after winter begins. Next inspect construction skip reasons and access to fine materials before buffing production rates. The study is saved in `/workspace/research-audit/clothing/deadline/findings.md` for this task.

A real transport mismatch was corrected: finished coats can be hauled in batches of one or more instead of waiting for four items. Both study arms include that correction. `tools/clothing-deadline-check.ts` verifies the preparation window, stock/ownership accounting, food safeguard and delivery of a three-coat batch. No clothing recipes, protection values, lifetime or recruitment defaults changed.

### Fine-material allocation follow-up

Construction tracing confirmed that seed 8919's clothing goal was active, fed and housed when its first six stored planks went into the Crown's Hall. Its sawmill blueprint arrived on day 12.25, production began day 16.58, and the first stored batch arrived day 17.54. Changing building preference alone did not protect a clothing project's material budget.

`BOT.clothingReserve` is an optional companion to the deadline. It reserves only the unfinished clothing buildings' fine-material costs, shared across planks/bricks/wicker; unrelated construction may use the surplus. Both task selection and actual pickup enforce the reserve, and it expires at winter. It does not reserve wood or grant resources. Eight checks in `tools/construction-reserve-check.ts` cover shared-material accounting, concurrent hauling and expiry.

The focused weaver/tailor completion dates improve from 25.46/27.46 to 18.62/20.58. Nevertheless, the strict three-coat deadline is still met in only one of eight scenarios, so both goal and reservation remain off by default. No recipes or prices changed. The next controlled question is early fine-production access—for example, a diagnostic scenario that also grants the sawmill blueprint without granting construction or materials. Final results are in `/workspace/research-audit/clothing/construction/findings.md` for this task.

### Early-access and whole-coat follow-up

The final matched comparison includes a transport correction: coat output is now hauled in whole units, leaving fractional work at the tailor. Otherwise a three-coat target could count fractional stock/output as complete while a pawn could not collect the last whole coat. Regression coverage now includes that case (12 deadline/transport checks).

Reservation alone still meets the three-coat first-winter target in one of eight cases. In a separate four-soil-map comparison, adding only the sawmill blueprint at the start improves textile target completion from zero of four to two of four. Construction, supplies and labor are still earned normally. Early sawmill access also changes charter choices (all four choose First planks), and charter 2 completes later in these whole-run comparisons. This supports fine-production access as an important constraint, not a free improvement or proof of a particular clothing price.

The next design decision is whether fine materials should have a reliable basic production route, remain dependent on drafts/trade, or be purchased more deliberately for optional preparation. No starting blueprint changes were made. Final data and reproduction commands: `/workspace/research-audit/clothing/construction/final/findings.md`.

### Slow baseline fine-material prototype

The chosen next direction was a slow starting capability, with drafted workshops as efficient upgrades. The experimental runner can attach a one-star 3-wood plank recipe to the starting woodcutter: nominal 0.6 plank/worker-hour versus a sawmill's 1 plank/hour at 2 wood per plank. This recipe is not attached in ordinary game content.

`BOT.roughPlanks` selects at most one hut for unmet construction demand and defers to an operable drafted fine-material producer. Initial 55/30 wood buffers plus winter reserves rarely allowed it to operate. A measured 35/20 band without the full winter-stock guard improved winter-opening availability from at least one coat in 2/8 cases to 5/8; the strict three-coat goal remained 1/8. All eight won, but one run finished around day 83 and another produced about 73 rough planks. This supports the access direction while showing why unrestricted fallback construction is too broad to adopt without more policy work.

The prototype and buffer settings remain opt-in. Ten checks in `tools/rough-planks-check.ts` cover actual production, cost ratios, activation bands and deferring to the efficient upgrade. Results and commands: `/workspace/research-audit/clothing/rough-planks/findings.md`. The next candidate is a bounded early construction budget followed by wood gathering and an upgrade plan; that cap has not been applied yet.
