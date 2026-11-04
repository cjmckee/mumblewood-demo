# Comfort milestones: opt-in prototype

This implements three threshold tracks with a trailing 24-hour average. Any active track grants level 1; any two grant level 2; all three grant level 3. Rewards are cumulative. This is an experimental world setting, not the main game's new default or a claim that milestones are proven better than a continuous curve.

## Scores and charter requirements

Each hour, score every living settler, average across the colony, and retain the last 24 hourly scores. No history is invented when the prototype is enabled: rewards require 24 consecutive samples. A brief provision failure affects only part of the window, but a track switches off as soon as its rolling average falls below the requirement. There is no additional grace timer, progress currency or hysteresis.

Scores are stable across charters so old samples remain comparable:

* **Homes:** no bed 0; basic bed 0.60; cozy cottage 1.00.
* **Meals:** hungry or last meal uncooked 0; otherwise processed 0.50, simple 0.65, refined 0.80, quality/magnificent 1.00, multiplied by 0.80 when eaten without a table. This is provision already enjoyed, not pantry stock.
* **Evenings:** recreation divided by 100, clamped to 0–1. The rolling window includes the whole day, not only night hours.

| Completed charters | Homes | Meals | Evenings |
| --- | ---: | ---: | ---: |
| 0: Camp | 50% | 35% | 40% |
| 1: Settlement | 65% | 55% | 50% |
| 2+: Village | 80% | 70% | 60% |

Threshold equality qualifies. A new charter immediately applies its higher requirements to the same rolling history; it does not erase or rescore the history. The prototype shows the current standing and the requirement beside each score. The existing continuous comfort curve remains underneath, including its seasonal needs and perks; the new tracks are separate stable scores, not those seasonally changing comfort scores averaged again.

## Reward sets

| Set | Level 1 | Level 2 | Level 3 |
| --- | --- | --- | --- |
| Balanced | 5% less passive strain growth | Also 5% faster workshop work | Also 5% chance to double a completed batch |
| Steady | 5% less passive strain growth | Also 5% faster workshop work | Total workshop speed bonus rises to 10% |
| Abundance | 5% less passive strain growth | Also 5% double-batch chance | Total double chance rises to 10% |
| Resilience | 5% less passive strain growth | Total strain reduction rises to 10% | Total strain reduction rises to 15% |

The strain multiplier applies to passive growth only, not event additions or relief. Production rewards affect recipe batches that consume ingredients; raw gathering, hauling, research and construction are unchanged. Existing speed modifiers still apply. No existing strain is erased by activating a track.

A winning bonus roll doubles **the entire batch**, consuming its original inputs once. A constant 5% chance therefore provides 5% expected extra output per eligible batch before downstream constraints; the balanced top level combines that with 5% faster work. Chance is not an extra-item-only rule. Each completed eligible batch gets one roll on a separate, saved random stream, so the feature does not insert arbitrary random calls into the weather/illness/event stream.

If the shelf cannot hold the extra batch, the earned bonus waits in a saved buffer. It fills available shelf space on following ticks, and blocks new work while any remainder waits. No output is discarded and the shelf cannot exceed capacity. Bonus goods enter normal production/charter tallies when placed on the shelf; earned bonus counters can temporarily exceed delivered bonus flow. Production limits can be exceeded by an earned bonus, just as a normal whole batch can overshoot a target. Input supply, hauling and storage can limit realized throughput, so nominal percentages are not whole-colony output predictions.

## Playable prototype

`npm run prototype:milestones` builds a standalone, offline-capable page using the actual simulation and shared scoring/reward helpers. It offers:

* A threshold lab: change provision averages and charter expectations to see activation and cumulative rewards. These hypothetical sliders do not alter the live colony.
* Four real checkpoints, each with a comfort project, an extra staffed kitchen, or a saved project budget.
* Six-hour, day and week advancement, showing rolling scores, requirements, level, mood, strain rate, construction, bonus batches and colony news.
* All four reward sets plus rewards-off, with identical starting state on restart.

The bounded investment policy matches the previous experiment: reserve one original worker and permit one new project for seven days; existing sites, normal events and recruitment remain active; normal construction and staffing resume for the follow-up week. Save keeps the worker in general labor. It is not unrestricted or optimal human play. `docs/comfort-milestone-checkpoints.json` preserves the checkpoint fixtures so the page builds without rerunning a scout. The main game does not enable the feature automatically. History, profile, bonus RNG, counters and pending output survive world JSON serialization when enabled.

## Threshold calibration and matched tests

First, the same four situations × three choices × five reward settings ran for 14 days: 60 related continuations. Initial housing requirements were 50/70/85%. Balanced reached level 3 for only 43 of 4,032 observed hours (1.1%); one cottage was just below settlement activation. The [initial gating export](comfort-milestones-initial-gating.json) preserves those thresholds and aggregates. Raw first-pass outputs were retained under `dist/comfort-milestones/initial/` in the execution workspace.

One calibration reduced housing requirements to 50/65/80%, leaving meals, recreation, window and rewards unchanged. The four enabled profiles were rerun against the same twelve rewards-off controls, producing the final 60-arm comparison. This calibration used these cases, so its apparent improvement is not independent validation. No further threshold search or reward optimization was performed.

| Set | Level-3 hours | Cooked meals made | Daytime sulking person-hours | Doubled / eligible batches | Extra units earned |
| --- | ---: | ---: | ---: | ---: | ---: |
| Off | 0 | 2,917 | 135.2 | — | 0 |
| Balanced | 233 | 2,712 | 123.0 | 13 / 163 | 23 |
| Steady | 217 | 2,789 | 123.0 | — | 0 |
| Abundance | 404 | 2,883 | 132.2 | 97 / 1,277 | 150 |
| Resilience | 314 | 2,991 | 132.2 | — | 0 |

Each row sums twelve 336-hour continuations. All had zero settler losses and nine additional charter completions in total; these counts do not establish equal completion times. Cooked-meal counts cover only one part of the economy, not total production, quality, value or resource efficiency. Extra units span different goods and batch sizes. Abundance can roll at level 2 as well as level 3. Finite observed double frequencies are not the configured probability; paired policies reuse starting bonus streams and are correlated. The separate seeded 100,000-roll check validates the 5% generator frequency.

Balanced level 3 occupied 5.8% of observed time after calibration. Level 1 was routine after the warmup in all enabled arms; level 2+ provided a more selective target. In the first week, the two cottage investments earned about 32 and 40 more hours at level 2+ than their kitchen alternatives under balanced rewards. The two stage choices did not earn additional higher-level time versus kitchens. Thus fixing a housing gap can now cross a visible threshold, while another amenity may leave the limiting tracks unchanged.

Balanced cottage-versus-kitchen mean mood differences were +3.07 and +1.31, versus +0.95 and +1.46 in the old rewards-off controls. Food differences still favored the kitchen. The village stage's meal provision remained a limiting factor. These are descriptive paired outcomes with adaptive production, events, recruitment and relief, not an isolated estimate of the new reward's causal contribution to mood.

**No winner is established.** Faster work did not translate to more cooked food in aggregate, and the upper-level sample is still limited. The separate fixture confirms that the speed multiplier actually accelerates workshop progress and that full-batch doubling works; colony bottlenecks and adaptive allocation still matter. Balanced is the initially selected playable variant because it matches the proposed experience, not because it won a balance trial. Steady is a useful comparison for predictability; abundance tests input efficiency and visible occasional bonuses; resilience is the defensive control. The next review should assess whether players understand the next reachable track and whether crossing it feels worth the cost, alongside broader production and resource metrics.

## Reproduce and checks

```sh
node --import tsx tools/comfort-investment-scout.ts
MILESTONE_PROFILE=off node --import tsx tools/comfort-investment.ts
MILESTONE_PROFILE=balanced node --import tsx tools/comfort-investment.ts
MILESTONE_PROFILE=steady node --import tsx tools/comfort-investment.ts
MILESTONE_PROFILE=abundance node --import tsx tools/comfort-investment.ts
MILESTONE_PROFILE=resilience node --import tsx tools/comfort-investment.ts
node tools/comfort-milestones-report.mjs
npm run check
npm run prototype:milestones
npm run test:ui:milestones
```

The initial threshold pass can be reproduced by temporarily using its recorded housing requirements in `REQUIREMENTS`; the shipped prototype uses the calibrated table above. Profiles run in separate processes, with mutable scenario settings restored. The exporter asserts equal horizons, matching profile configuration, level exposure totals and agreement of all twelve disabled controls with the previously checked-in investment results. See [final results](comfort-milestones-results.json) for all summaries, seven-/fourteen-day windows and paired choices.

Focused simulation checks cover full-day warmup, expiry, threshold equality, charter increases, profiles, real speed and strain multipliers, deterministic saved rolls, probability, doubled batch output, shelf backpressure and pending-bonus save/resume. The full 41-suite simulation check, TypeScript and build passed. Offline browser checks cover desktop and phone widths, keyboard/threshold interactions, restarting, profile selection and advancing an actual colony through 24 hours.
