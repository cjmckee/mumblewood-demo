# Comfort investment versus production

Four affordable decision points were forked into comfort construction, an extra stew kitchen, and saving the project budget. Each was repeated under current, gentler and no passive growth: **36 continuations from four selected situations**, not 36 independent samples. All lasted the full 14 days. This is an explicit-policy comparison, not a human playtest.

The main finding is a small incremental payoff through passive strain growth. Comfort construction sometimes improved mood or interrupted less work, but practical food production could improve comfort too. The gentler curve increased some small strain savings without making comfort investment a clear general winner. No new items or default balance changes follow from this test.

## Choices and controls

The scout follows normal seeded play and stops at the first affordable, owned, unbuilt stage/cottage opportunity with fewer than two active sites and an available spot. We selected these cases after inspecting availability and needs:

| Case | Starting strain | Mean mood | Comfort | Why included |
| --- | ---: | ---: | ---: | --- |
| 24757, cottage, hour 995 | 17.51 | 47.77 | 68.9% | High existing pressure; all ten settlers have basic beds |
| 42, cottage, hour 1503 | 6.98 | 67.58 | 87.1% | Lower pressure, healthy mood and well-provided stores |
| 1000, stage, hour 1452 | 9.47 | 65.30 | 71.6% | Village evenings score only 53.3%; a pavilion is already under construction |
| 303, stage, hour 990 | 8.66 | 65.88 | 69.0% | Evenings initially score 100%; missing summer drinks limit comfort |

Each case clones the entire world and decision RNG across nine arms. No blueprint, resource, worker or relief grants. Both projects are affordable from the original stock. Comfort builds one cottage (six wood, ten fine goods) or stage (twelve wood, five fine goods); production builds one extra kitchen (eighteen wood). Actual fine goods used were planks. These are the real prices, not artificial equal-cost bundles.

For seven days, each arm has one discretionary project slot: the selected project or none. Other new buildings and paths are deferred, while existing sites, research, recipes, trade, events, recruitment, festivals and the finale continue normally. One original healthy, available laborer is reserved in every arm. That person remains in general labor for comfort/save, and builds/hauls normally until the production kitchen finishes, then takes the explicit stew assignment. This does not force the laborer to build only the chosen site. Other workers can help construct it. If the reserved person becomes ill or is sent on an errand, they are not replaced with a free substitute.

At seven days, normal bot construction and worker allocation resume in every arm. The following week measures aftermath, including catch-up investment. This budget restriction deliberately makes the choice concrete; it does not represent unrestricted, optimal play, and can postpone urgent infrastructure or beds. Cottage construction also provides capacity and may satisfy charter goals, so it is not a pure shelter-score experiment. Food production can improve meal comfort and mood as well as stock.

The optional `autoBuild(w, { construction: false })` gate supports this bounded budget. It skips new buildings, food depots and paths while keeping other planning active. Omitted options retain the old behavior; the standard game and bot do not use the restriction. The harness asserts that no unselected building appears during the commitment. No logistics repair is included.

## First-week results

Current curve, full 168-hour commitment:

| Case | Policy | Mean mood | Daytime sulking person-hours | Cooked meals made | Passive strain added |
| --- | --- | ---: | ---: | ---: | ---: |
| High-pressure cottage | Comfort | 49.34 | 38 | 126 | 5.708 |
| | Production | 48.39 | 9 | 147 | 5.988 |
| | Save | 46.87 | 64 | 166 | 5.789 |
| Lower-pressure cottage | Comfort | 70.94 | 0 | 140 | 3.787 |
| | Production | 69.48 | 0 | 210 | 3.695 |
| | Save | 72.64 | 0 | 105 | 3.688 |
| Village stage | Comfort | 68.95 | 0 | 140 | 3.988 |
| | Production | 68.38 | 0 | 146 | 3.717 |
| | Save | 65.81 | 0 | 130 | 4.052 |
| Initially well-covered evenings | Comfort | 70.32 | 0 | 107 | 3.294 |
| | Production | 65.38 | 0 | 135 | 3.319 |
| | Save | 63.53 | 0 | 132 | 3.384 |

“Cooked meals made” sums whole-colony production of meal goods, not nutrition, refined-charter progress or output from only the new kitchen. The saved laborer can supply other workshops, which is why an extra kitchen is not automatically a net production gain. Daytime sulking uses the workday activity ledger and is not a counterfactual quantity of lost output. Hourly mood means are colony averages, so population changes matter.

Against saving, three comfort arms avoided **0.064–0.089 passive strain** in the week; the lower-pressure cottage added 0.099 more, despite better average comfort, alongside different population/event histories. Against production, high-pressure housing avoided 0.280, low-pressure housing added 0.092, village stage added 0.271, and the other stage avoided 0.025. Compare actual population/time paths as well as comfort before interpreting those differences.

Under gentler, comfort-versus-save passive-growth savings were 0.131 (high cottage), −0.049 (lower-pressure cottage), 0.115 (village stage) and 0.153 (other stage). This is a larger reward in three cases, but remains a small amount beside inherited strain of roughly seven to eighteen. Strain growth is only one channel of an investment's value.

The high-pressure cottage arm had about one more average mood point than production, but 29 more daytime sulking person-hours; a colony mean can conceal who crosses the work-refusal threshold. The kitchen made 21 more meals than comfort, while saving made 40 more than comfort. No single metric establishes a best recovery strategy.

End strain can increase even when less passive growth was added. For example, high-pressure comfort received only 4.124 relief during the week, versus 5.804 in production. All ordinary relief and events remain adaptive; end strain is not a direct measure of the curve's reward.

## Timing, worker cost and aftermath

Current cottages completed after 21h and 19h. Stages completed after 76h and 25h; the village stage competed with the already-running pavilion. Production kitchens completed after 19–27h. No project was instantly supplied or built. The compact export includes every arm's material delivery and construction completion.

The reserved production workers spent about 45–55 hours in the working activity at their new kitchen during the first week; this activity measure includes travel to work, and does not mean every hour yielded output. Comfort/save workers remained available for general labor, with actual hauling/building activity recorded. Construction-activity times likewise include movement. Other workers' allocation remains adaptive.

All current arms completed one additional charter within 14 days in each cottage case and the seed-303 stage case. None completed the finale within 14 days in the village-stage case. There were no settler losses in the current arms. These are charter-count outcomes, not equal completion times or evidence that the choices are equivalent. Full summaries and matched seven-/fourteen-day windows for every curve are in [the compact results](comfort-investment-results.json).

Benefits also remain when passive growth is disabled. For example, the seed-303 stage beat production's first-week mean mood by 4.74 points with growth off, versus 4.94 currently. High-pressure housing's corresponding differences were 0.96 and 0.95. This supports substantial value through channels other than future passive strain; it is not an exact decomposition of the mood effect, since inherited strain, events, relief, choices and populations can still diverge.

## Design takeaways

1. **Use realistic upgrade sizes when tuning.** Improving all-colony comfort from 60% to 90% illustrates the curve, but one cottage changes a much smaller share of the average. At the high-pressure checkpoint, upgrading two of ten settlers from basic to cozy shelter raises the five-need average by only one percentage point before other changes. A fixed-condition, full-week estimate is about 0.08 strain avoided currently or 0.13 with gentler, even before construction delay. The observed reward is small for understandable reasons.
2. **The gentler curve alone has not demonstrated a noticeable comfort-investment payoff.** Keep it experimental. If strain prevention is supposed to motivate the purchase, prototype a larger reward for achievable improvements, and review scoring saturation/averaging as well as slope. Increasing penalties for struggling colonies is not the conclusion from these cases. A very steep reward for a one-point change could create cliffs, so a single-building numerical target needs a broader provisioning strategy check.
3. **Essential provision is a comfort strategy too.** The village kitchen outperformed the stage on average comfort and passive growth. Avoid presenting amenities as the only way to manage strain; show which need an investment would actually improve.
4. **Keep the item set.** Existing homes, meals and leisure already produce distinct costs and benefits. Better feedback about counted needs and estimated strain prevention should precede new goods.
5. **No claim about player understanding yet.** These are scripted choices under a limited project budget. Human play is still needed to see whether the prediction is understandable and the tradeoff feels worthwhile. The numerical tests narrow what to prototype; they cannot answer that experience question.

## Reproduce and validate

```sh
node --import tsx tools/comfort-investment-scout.ts
node --import tsx tools/comfort-investment.ts
node tools/comfort-investment-report.mjs
npm run check
npm run prototype:comfort
npm run test:ui:comfort
```

The recorded run used two independent processes for `24757-cottage,42-cottage` and `1000-stage,303-stage`. The report reads individual arm outputs. Raw checkpoints, hourly traces and event logs remain under `dist/comfort-investment/`. Checkpoint hashes match within each case. The strain accessor preserves values while separately recording positive tick additions (passive growth), decision additions and negative relief; its accounting identity is asserted hourly. The exporter verifies built projects, full common windows and zero passive growth in that arm. The default game retains its original balance.
