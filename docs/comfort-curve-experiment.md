# Comfort curve experiment

The charter celebrations are merged in PR #22. This branch adds an opt-in comfort curve experiment, a mobile comparison page and matched bot continuations. The normal game still uses `1.4 − comfort`; no goods, buildings, need scores, mood rules, festival relief or bot defaults change.

## Curves

All values are multipliers on the existing population/time strain rate. The proposed and gentler curves use linear interpolation between these points; inputs clamp to 0–100% and growth remains positive, with a 0.2× floor. Comfort does not passively erase strain.

| Comfort | Current | Proposed | Gentler |
| --- | ---: | ---: | ---: |
| 0% | 1.40× | 2.20× | 1.40× |
| 30% | 1.10× | 1.80× | 1.10× |
| 60% | 0.80× | 1.00× | 0.80× |
| 90% | 0.50× | 0.30× | 0.30× |
| 100% | 0.40× | 0.20× | 0.20× |

The gentler alternative preserves current penalties through 60% comfort while making high comfort more valuable. It tests whether the reward can be strengthened without increasing pressure on colonies still establishing their basic services.

At ten settlers on day 20, 90% comfort gives about +0.35 strain/day currently and +0.21 with either candidate. Improving from 60% to 90% for ten days avoids about 2.3 strain currently, 5.3 with the proposal and 3.8 with the gentler alternative. Those calculations hold population and comfort fixed, allow the time ramp to continue, and exclude perks and relief; they are not whole-run simulation outcomes.

The simulation and comparison page share `comfortMultiplier`. Homesteaders still multiplies effective comfort by 1.3 before the curve; other strain modifiers and relief are unchanged. The strain dialog now uses the actual simulation helper, including Homesteaders, rather than independently repeating the old linear formula.

## Matched continuations

Two seeds, 1000 and 24757, follow the normal game and bot until the first charter completes. Its immediate next choices and that hour's construction are already part of the common checkpoint. Each world and decision-RNG state is then cloned into six continuations: three curves, each with standard staffing or the existing `BOT.comfortsFirst` priority enabled. No grants, new bot policies, forced construction, recruitment overrides or relief changes are used.

Earlier comfort staffing affects the priority of already-built comfort services relative to food/wood top-ups. It is not an optimal human comfort-first strategy or a different charter-selection policy. All continuations stop at victory, collapse or 90 elapsed days from colony creation; a cutoff is an unfinished run, not a loss. Within each seed, all rows share the checkpoint hash in [the compact results](comfort-curve-results.json).

| Seed | Curve | Staffing | Outcome / elapsed days | Lowest mood | Settlers lost after fork |
| --- | --- | --- | --- | ---: | ---: |
| 1000 | Current | Standard | Won / 75.5 | 5.5 | 0 |
| 1000 | Current | Comfort earlier | Won / 75.5 | 5.5 | 0 |
| 1000 | Proposed | Standard | Won / 87.5 | 12.3 | 0 |
| 1000 | Proposed | Comfort earlier | Cutoff / 90 | 12.3 | 0 |
| 1000 | Gentler | Standard | Cutoff / 90 | 12.4 | 0 |
| 1000 | Gentler | Comfort earlier | Cutoff / 90 | 12.8 | 0 |
| 24757 | Current | Standard | Won / 58.5 | 2.4 | 1 |
| 24757 | Current | Comfort earlier | Cutoff / 90 | 2.4 | 1 |
| 24757 | Proposed | Standard | Won / 65.5 | 14.7 | 0 |
| 24757 | Proposed | Comfort earlier | Won / 65.5 | 14.7 | 0 |
| 24757 | Gentler | Standard | Won / 57.5 | 9.2 | 0 |
| 24757 | Gentler | Comfort earlier | Won / 55.5 | 9.2 | 0 |

Both candidates have higher minimum moods and no settler losses in these cases, but completion does not consistently improve. Under seed 1000 the gentler curve reaches the second completed charter on day 88 and has not completed its finale at the cutoff. This is not evidence that stronger comfort necessarily makes the whole game faster or easier.

Ten common noon snapshots after the fork also show why the stricter penalties deserve attention. In seed 24757, the proposed standard-staffing continuation averages mood 45.5 versus 47.1 currently and 47.2 with the gentler curve over that early window. The lowest mood over the eventual complete continuation nevertheless improves. In seed 1000 the candidates' lower strain at the last common-window sample also coincides with a smaller population (nine versus ten). Do not attribute the full difference solely to the curve at a fixed population.

Later events, festivals, recruitment and choices diverge. Whole-continuation means have different observation durations; the checked-in ten-day statistics are ten noon samples, not hourly means. These twelve continuations use only two shared-seed checkpoints, not twelve independent samples or a win-rate estimate.

## Recommendation

The [situational recovery follow-up](comfort-recovery.md) tests food loss, a recruit beyond bed capacity and diverted tavern workers, and diagnoses the seed-1000 meal-chain delay. It preserves the default balance and keeps logistics counterfactuals separate from the curve comparison.

Keep both curves experimental while reviewing the tradeoff in the mobile comparison. The gentler alternative is a useful starting point for player testing because it strengthens high-comfort rewards without adding low-comfort penalties. The results do not establish that it is the better whole-game balance: it also has unfinished seed-1000 continuations. Next, watch recovery from a concrete housing/food/service shortage and the cost of fixing it, rather than treating faster bot victories as the sole design goal or adding items to compensate.

## Reproduction and review

```sh
node --import tsx tools/comfort-probe.ts 1000 90
node --import tsx tools/comfort-probe.ts 24757 90
npm run prototype:comfort
npm run test:ui:comfort
npm run check
```

The probe writes full checkpoints, summaries and daily traces under `dist/comfort-probe/<seed>/`. `docs/comfort-curve-results.json` is a compact export of those runs. The comparison generator embeds that checked-in export so the review page builds without rerunning the simulations. It has no network dependencies; the controls compare both candidates with the default using the same calculation as the simulation.

For an independent experiment, set `START.comfortScale.curve` to `STRONG_COMFORT_CURVE` or `REWARD_COMFORT_CURVE` before ticking the world. This is a scenario setting, not a user-save field. No production default has been promoted.
