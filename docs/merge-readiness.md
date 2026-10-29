# Phase 3 merge checkpoint

This checkpoint packages the research-tree branch and the first Phase 3 slice for review before further polish. It does not complete the historical Phase 3 feature list or establish final balance.

## Included behavior

- Research basics unlock static specialization branches; projects retain their prerequisites and all branches can eventually be researched.
- Both clothing chains produce interchangeable personal coats. Settlers collect them in winter and store their own coats outside winter, pausing wear. Clothes reduce cold mood and chill risk; homes still need fuel.
- New games start on summer 1. Starting population/date are configurable through scenario/world creation, with no new setup screen.
- Workshops collect complete recipe batches, share finite input/output buffers, and return surplus ingredients. Recipe priority and warehouse-only stock targets are configured per workshop.
- The starting woodcutter offers slow rough planks. Bots use a bounded early fallback, plan a feasible fine-material route and its suppliers, and avoid reserving food for infeasible recipes.
- Spring no longer asks for an undefined fresh-food category; existing wet-weather effects remain. Tavern guests consume one small serving per evening and keep socializing afterward.
- Bots release jobs with zero seasonal yield and prioritize an affordable first clinic and a healthy doctor during bedrest.
- Critical illness can displace noncritical clinic patients. Existing critical care continues; waiting critical cases use severity, and noncritical cases use first-request order, retained after displacement. Arriving patients reserve capacity. The clinic panel exposes the waiting list.
- Interrupted meals can complete through the existing bedside-feeding behavior.

Implementation details and focused findings are linked from [clothing](phase3-clothing.md), [logistics](workshop-logistics.md), [bot policy](bot-production.md), [tavern service](tavern-servings.md), and [clinic admissions](clinic-admissions.md).

## Defaults and experiments

Ordinary recruitment remains unchanged. The population taper, clothing deadlines/reservations/batching, alternative source staffing, and stronger summer drink weighting remain diagnostic options. Summer service is not forced through a new bot policy. Preserves are deferred. Charcoal, family housing and Phase 4 individual wants/luxuries are future design choices.

## Final-default watched runs

These fresh-process runs use the final noncritical queue implementation and ordinary recruitment (`current` mode). The cellar case explicitly grants only one blueprint; it grants no goods, workers or construction. These are three diagnostic cases, not a win-rate estimate or a matched comparison with earlier taper runs.

| Case | Victory day | Final population | Deaths | Departures |
| --- | ---: | ---: | ---: | ---: |
| Ordinary seed 1000 | 35.33 | 16 | 0 | 0 |
| Ordinary seed 24757 | 48.46 | 16 | 0 | 0 |
| Seed 8919, cellar blueprint access | 79.58 | 16 | 1 | 0 |

The cellar case's first charter finishes on day 42.46. Noon traces around days 28–30 show eight able-bodied settlers, three reserved laborers and five staffed jobs: raw food, clinic, research, wood and kitchen. The sawmill requests workers but receives none, even after wood exceeds its production reserve. Continued illness and staffing priorities therefore delay fine production. This remains a bot pacing follow-up; the run eventually completes all three charters. Do not infer a medicine buff or production-rate change from this case.

None of these three cases makes or equips coats. Both routes and personal ownership/storage are exercised by the focused clothing suite and prior route-access probes; these ordinary runs do not establish clothing uptake or economic balance. All three end at 16 settlers, so the desired smaller-colony pacing also remains unresolved under shipped recruitment.

Reproduce with:

```sh
SEEDS=1000,24757 WATCH=1 RESULT_DIR=dist/merge-readiness/ordinary npx tsx tools/combined-seasons.ts current 2 90
SEEDS=8919 WATCH=1 EXTRA_BLUEPRINTS=cellar RESULT_DIR=dist/merge-readiness/clinic-access npx tsx tools/combined-seasons.ts current 1 90
```

Hourly traces and full reports from this checkpoint are retained in this task's workspace at `/workspace/research-audit/merge-readiness/`. Compact outcome data is checked in as [merge-validation.json](merge-validation.json). Commands regenerate the full evidence without depending on those local paths.

## Validation and compatibility

`npm run check` runs TypeScript, all 26 focused simulation suites in isolated processes, and both HTML builds. The suite includes clothing/calendar/save migration, recipe batches and workshop controls, construction reserves, research/recruitment/events, production routes, bedside meals, tavern servings, bot planning, seasonal staffing, and clinic queues/displacement/save-resume. Pull requests run the same command in GitHub Actions.

The browser save/resume check runs over HTTP at phone width. The clinic browser check loads a saved outbreak and verifies the triage explanation, waiting list and fatal-illness warning without page errors. Earlier browser checks covered workshop controls and worn/stored coat cards. Browser checks are separate from the automated Node suites.

Existing saves retain their summer-6 calendar, receive zero newly introduced resources, and initialize missing queue timestamps on their next tick. Personal coats, workshop controls/buffers and request times survive save/resume. Existing saves do not receive retroactive clothing or production grants.

## Follow-up after merging

Prioritize player-facing clarity and usability: workshop buffer/target explanations, coat ownership/condition, seasonal preparation information and clinic capacity. Doctors already help with general labor when nobody needs bedrest; the fallback currently checks the whole colony, so an empty clinic may retain a doctor while another clinic treats patients.

Return to seasonal balance and bot staffing with a handful of watched cases. The summer-to-winter difficulty curve, optional clothing uptake, population targets and long outbreak recovery remain open. These limitations are recorded rather than extending this checkpoint into new medical rules or additional production chains.
