# Comfort: situational recovery studies

The gentler curve remains a candidate for player testing, not a proven balance improvement. It buys some strain headroom without repairing shortages faster. Existing food, beds and tavern service already create consequences; these studies do not justify adding items or increasing low-comfort penalties. The normal game retains its original curve.

## What was played

Three selected situations, each forked into current/gentler × shock/no-shock for 336 hours. Each was repeated with normal events and with a restricted event policy: defer future storyteller events and decline routine recruit offers. That makes 24 continuations from three situations and two seeds, not 24 independent samples. World and decision-RNG checkpoints are identical within each comparison; the harness asserts matching treated-world hashes across curves. Production, movement, trade, weather, illness and endogenous festivals continue normally. See [the compact export](comfort-recovery-results.json) for hashes, interventions and all summaries.

* **Food:** Seed 1000, hour 447.17, six settlers. Remove 17 accessible stored food units, leaving three (half a unit per settler), through normal stock accounting. Production continues; carried goods and workshop baskets/inboxes are untouched. Control removes nothing.
* **Housing:** Seed 1000, hour 486, eight settlers/eight beds. The ordinary bot buffers capacity, so this is an explicit returning visitor scenario: accept one previously offered, unselected, fee-free recruit through the normal recruit command. Nine settlers now share eight beds. This includes another worker and mouth to feed, so it is not an isolated shelter-score test. Control accepts nobody. No building or resource grants.
* **Service:** Seed 24757, hour 1507, twelve settlers. A common preparation chooses actually offered tavern/brewery blueprints, pays for construction and assigns real workers. This was needed because reference continuations did not provide a naturally staffed tavern case. Both arms reserve a serving trade; the shock diverts service workers into general labor for 48 hours, then restores service. Both defer the automatic founders feast so victory cannot truncate recovery. A preliminary run that ended after 23 hours was excluded. Preparation is a scripted service-investing policy, not a claim about ordinary bot behavior.

## Recovery and immediate consequences

The table uses the restricted-event variant. “Recovery” is the beginning of the first qualifying period: food at least two accessible units/settler with nobody hungry for 12 hours; everyone housed for 24 hours; or, after service release, a staffed tavern with a new regular drink stock charge (festival charges excluded). Food/housing are sampled hourly, so these are approximate operational milestones, not exact first bites or bedtimes.

| Shock | Recovery, current / gentler | Lowest individual mood in first 48h, current / gentler | Sulking person-hours in first 48h, current / gentler |
| --- | --- | --- | --- |
| Food loss | 22h / 22h | 16.3 / 16.3 | 9 / 9 |
| One settler beyond bed capacity | 30h / 30h | 30.1 / 30.1 | 0 / 0 |
| Tavern workers diverted for 48h | 49h / 49h | 16.0 / 16.2 | 19 / 19 |

In the same 48h windows, no-shock controls reached minimum moods of 20.5 (food), 30.3 (housing), and 22.5 (service), with 0, 0 and 4 sulking person-hours respectively under either curve. The ordinary-event variant recovered in 21h, 30h and 49h under both curves. No settler losses occurred in any of the 24 continuations. Those are recoverable selected cases, not evidence that severe shortages are always safe.

For restricted-event food loss, strain rose by 0.425 under current and 0.336 under gentler over the first 48h; no-shock increases were 0.405 and 0.296. Housing shock increases were 0.536 versus 0.418, compared with no-shock 0.479 versus 0.350. Thus the gentler curve offered only about 0.09–0.12 less additional strain in those two-day shock windows. It preserved the direct mood/sulking consequences and did not accelerate material recovery. Both housing shock arms spent about 29.7 homeless person-hours and used eight wood on housing over the full window; controls also used eight wood, reflecting the bot's capacity planning.

Service results are particularly sensitive to existing perks and relief. Homesteaders changes effective comfort and can put the gentler curve at its floor. Festivals remain endogenous even with storyteller events deferred. Current service arms received relief within the first 48h while gentler arms did not, so current strain actually fell during that window. At 14 days the gentler service shock had lower strain than the current shock (5.61 versus 14.92), but 39 versus 19 sulking person-hours, with different relief histories. This is not a clean measure of a service worker's marginal value. Ordinary events and recruitment add further divergence: one food continuation accepts a deserter, adding a settler and three strain.

## Why seed 1000's charter slowed

The second charter, Good Table, needs ten settlers, forty refined-or-better meals eaten and a 24h average mood of 55. Current completed at hour 1417 (calendar day 60); gentler at hour 2097 (day 88). The meal tally first meets its target at hours 1339 and 2097 respectively. Mood fluctuates, but in gentler the meal tally sits at 28/40 for a long stretch; by day 80 its mood average is around 73, already above the target. More comfort cannot supply the missing meals.

The gentler bakery was built around day 43 but did not get a baker until roughly day 88. Snapshots at hours 1428, 1668 and 1908 show a starved mill despite assigned workers: two acorns in storage and two in a forager's basket, while flour needs three grist per batch. Normal hauling skips that small basket, and workshop input planning cannot use producer outboxes directly. The displayed blocked reason also misses partial-batch shortages because it checks for less than one ingredient rather than the full recipe quantity. Forager recipe priorities do not reliably replenish the batch.

A bounded diagnostic from hour 1428 assigned one real, nearby laborer to haul those two acorns. It created no goods. Both diagnostic arms held hourly bot construction/staffing planning for six hours, with normal production and movement still running, then resumed it. After six hours, the haul arm had made two more flour; control's basket remained untouched. The second charter completed at hour 1866 versus 2036 in the matched held-planner control: **170 hours, about 7.1 days earlier**. The unchanged original continuation finished at 2097; do not compare that directly with the repair arm because its planning policy differs. This demonstrates a consequential logistics bottleneck, not that this one haul explains the entire original 28-day gap. The direct haul task is a diagnostic intervention, not an existing player UI command.

## Design proposal

1. Keep gentler as the next human-play candidate. No new items and no extra penalties below 60% comfort. Its purpose is a gradual safety margin, not instant happiness or passive strain recovery.
2. Keep urgent needs distinct from long-term provision. Food shortages and service interruptions already hurt mood directly; increasing those penalties risks double punishment. Housing recovery here was mild and affordable, so do not tune a general homelessness penalty from this case alone.
3. Make the payoff visible: show comfort's current strain growth rate and the effect of an achievable improvement. The first two days of benefit were small enough to be hard to feel unaided. If human players still cannot feel a useful margin over a charter, tune the curve before adding goods.
4. Investigate small-batch hauling and accurate recipe blocking separately before judging charter speed. This is a production/logistics issue; no fix is bundled into the comfort experiment.
5. Next, compare real player choices from the same checkpoints: rebuild beds now versus expand food first, or restore service versus keep that worker producing essentials. These tests compared disruptions with no disruption, not competing recovery strategies. Watch whether players can predict the tradeoff and recover; do not use victory time alone as the verdict.

## Reproduce

Run from the repository root at this branch's simulation revision. The scout and service preparation use the unchanged production default; each command is a separate process so scenario settings reset.

```sh
node --import tsx tools/comfort-probe.ts 1000 90
node --import tsx tools/comfort-scout.ts
node --import tsx tools/comfort-service-prep.ts
node --import tsx tools/comfort-recovery.ts
CONTROLLED=1 node --import tsx tools/comfort-recovery.ts
node --import tsx tools/comfort-delay.ts
node --import tsx tools/comfort-delay-repair.ts
node tools/comfort-recovery-report.mjs
npm run prototype:comfort
npm run typecheck
```

Raw world checkpoints, hourly traces, event histories and intermediate counterfactual output live under `dist/comfort-recovery/`. The checked-in compact export builds the mobile report without rerunning simulations. No production behavior or default balance changes in this follow-up.
