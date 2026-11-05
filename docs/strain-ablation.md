# Does strain change outcomes or decisions?

**Strain has a measurable cost that this bot usually manages.** Removing passive growth substantially reduced work interruptions and festival consumption, but did not improve the number of victories in these cases. This supports strain as a functioning pressure system. It does not establish that the gentler comfort curve is the correct balance, or that strain is a dominant strategic constraint for humans.

## Test design

Eight seeds were selected before the run: 1000 and 24757 from the earlier experiments, plus 7, 42, 101, 202, 303 and 404. They are a small diagnostic set, not a random or representative sample. Every seed follows the unchanged game and default bot until the first charter completes, including that hour's subsequent decisions and construction. All eight reached a surviving checkpoint; none was excluded.

Each checkpoint, including the decision RNG, was cloned into four arms:

| Arm | Intervention after the checkpoint |
| --- | --- |
| Current | Original linear comfort curve and passive strain growth |
| Gentler | Experimental curve with the original low-comfort penalties and stronger high-comfort rewards |
| Growth off | Set passive growth rate to zero; retain inherited strain, additions from events, and normal relief |
| Strain zero | Hold strain at zero by intercepting every read/write of the world field; also disable passive growth |

The zero arm retains inherited mood, mood history, memories, tasks and sulking. It does not instantly reset settlers to happy or rested. Intercepting the field inside the research harness prevents event additions from briefly affecting decisions within the same tick. The game source and defaults are unchanged.

All arms keep the same bot **policy**, not the same actions. Recruitment, blueprints, staffing, festival decisions, storyteller pacing and event choices respond normally to the altered world. Starting RNG states are matched; later random draws and outcomes can diverge. This tests the whole system with an adaptive bot, not an isolated mood-penalty coefficient or an optimal human strategy. No resource grants, logistics repairs, feast deferrals or event restrictions were used.

Each continuation stops at victory, collapse or 90 elapsed days since colony creation. Equal-window comparisons use the first 30 days after the checkpoint, shortened across all four arms of a seed if any ends earlier. In this run every seed supplied the full 720-hour window. The first ten days are also recorded separately. Full-continuation totals are not treated as equal-duration comparisons.

## Results

| Arm | Victories by elapsed day 90 | Median paired mean-mood change | Daytime sulking person-hours | Festival goods consumed |
| --- | ---: | ---: | ---: | ---: |
| Current | 8 / 8 | Reference | 245.3 | 151 |
| Gentler | 7 / 8 | +1.24 | 147.3 | 122 |
| Growth off | 8 / 8 | +2.56 | 27.7 | 32 |
| Strain zero | 8 / 8 | +6.20 | 20.5 | 22 |

Mood, sulking and festival goods use the matched 30-day windows. Mood change is calculated against current within each seed and then the median across eight seeds, not a difference between unrelated population averages. Sulking and goods are sums across the eight windows. Festival goods combine meals and drinks, not currency or weighted production cost. Daytime sulking comes from the simulation's workday activity ledger; it measures time refusing work, not the counterfactual quantity of output lost.

Disabling growth reduced daytime sulking by about 89% in aggregate, but the absolute current burden averages **30.7 person-hours per colony over 30 days**. About 83% of it came from the original two seeds. Four current arms had no daytime sulking during that window. Do not frame the percentage as evidence that ordinary colonies are universally crippled by strain.

Current had one departure, in seed 24757. Gentler and growth-off had no departures or deaths. Strain-zero had no departures but one frontier-flu death in seed 24757. These events occurred within the common windows and were also the full-continuation loss totals. Strain removal does not eliminate disease, shortages or other failure routes; the changed event history means the flu death is not evidence of a direct protective effect of strain.

The gentler arm had one unfinished run at the cutoff and no collapses. These are eight shared-seed cases/four related arms, not 32 independent trials or population win-rate estimates. All trials are conditional on reaching the first charter under normal rules; they say nothing about the early survival effect of removing strain from a fresh game.

## Victory speed and bot behavior

| Seed | Current victory day | Growth-off victory day | Strain-zero victory day |
| --- | ---: | ---: | ---: |
| 1000 | 75.5 | 80.5 | 70.5 |
| 24757 | 58.5 | 75.5 | 58.5 |
| 7 | 71.3 | 64.5 | 69.5 |
| 42 | 80.5 | 70.5 | 70.5 |
| 101 | 67.5 | 58.5 | 64.5 |
| 202 | 55.5 | 49.3 | 66.5 |
| 303 | 65.5 | 60.5 | 63.5 |
| 404 | 83.5 | 71.5 | 82.5 |

Growth-off wins sooner in six of eight cases, but later in two—including 17 days later for seed 24757. Its mean mood over the common window is actually lower than current for seed 303. Gentler has lower common-window mean mood in seeds 42 and 303 despite its weaker growth. These reversals are consistent with the system's adaptive responses: festivals provide positive memories as well as strain relief, and growth changes event timing, recruitment, production, staffing and charter choices. This test does not attribute each completion-time reversal to a single cause.

There were 14 festivals in current's common windows versus four in growth-off and four in strain-zero. The bot directly consults strain when deciding whether to hold festivals; the storyteller also uses strain for eligibility and event gaps. Thus there is observed resource spending and work disruption alongside code paths that respond to pressure. Winning despite those costs is different from strain having no effect. Conversely, these tests do not prove that a human faces a compelling comfort-versus-expansion decision.

The known seed-1000 small-batch hauling bottleneck remains in every arm. The previous diagnostic logistics repair is not included here. Production can still dominate completion time even when settlers are happier.

## Design takeaway

Do not make comfort harsher on the theory that strain currently does nothing. Equally, do not promote gentler on the theory that these bots needed rescue: the current bot won all eight cases. The evidence supports a narrower claim: strain consumes some work and festival resources, with highly uneven severity; gentler reduces that aggregate burden but has mixed overall results.

Keep the existing production default and both curve candidates available for testing. The next useful design test is a small human or explicit-policy comparison of **comfort investment versus essential production/expansion from the same state**, recording the resource and worker cost, expected strain avoided, whether players understand the tradeoff, and how the next charter feels. Include both a high-pressure checkpoint and one of the low-pressure new cases. Make strain growth and the predicted benefit visible before evaluating whether to strengthen the reward. More bot win-count comparisons alone are unlikely to settle that design question.

## Reproduce and validate

```sh
node --import tsx tools/strain-ablation.ts
node tools/strain-ablation-report.mjs
npm run prototype:comfort
npm run typecheck
npm run test:ui:comfort
```

The recorded run used four independent process batches with `STRAIN_OUT=dist/strain-ablation/{a,b,c,d}` and seed pairs `1000,24757`, `7,42`, `101,202`, `303,404`. The report accepts those four output directories as arguments. Separate processes isolate mutable scenario settings; no concurrent world shares those settings. The harness restores settings on exit and asserts an unchanged bot policy and zero strain in that arm. Each arm's raw hourly trace and event log stay under its output directory.

The exporter checks unique seed batches, matching checkpoint hashes, complete common windows and agreement with the original current/gentler results for seeds 1000 and 24757. The [compact export](strain-ablation-results.json) contains all summaries, fixed ten-day metrics, common-window metrics, checkpoint hashes and source revision. The mobile report builds from that export without rerunning the simulation.
