# Is summer drinking worth its opportunity cost?

Current behavior: [one regular tavern serving per settler per evening](tavern-servings.md). The investigation below records the historical repeat-drinking behavior and the design decision that led to the serving cap. Its historical commands now run with the current serving rule, so use its archived artifacts for the original results.

The user's intended direction is an incentive to use drinks in summer, while retaining the option to do well without them. A bot policy that always serves cannot establish whether the game's incentive is strong enough. This comparison therefore measures two optional strategies without changing the need, drink prices, production rates or comfort formula.

## Same-state comparison

Both taper/24757 continuations use current spring recovery rules and enable the same experimental fine-input construction planning at hour 720. This common setup fixes the known construction dependency loop and reaches a state with a brewery, tavern and drinks. It grants no resources or buildings.

At hour 1152 (day 49), world, bot settings, seasonal rules and decision RNG are byte-identical. Only then does one continuation enable `BOT.summerService`. The other retains ordinary finale banking. The service policy prioritizes one tavern worker after immediate food/wood/kitchen/research allocation while summer drinks exist and food is above the emergency threshold. Workers come from the existing colony. It does not claim that the finale's drink supplies are complete, force drinking, or introduce mandatory consumption. Its priority expires outside summer.

| Result | Finale banking | Summer tavern service |
| --- | ---: | ---: |
| Average drink satisfaction, final summer window | 0.035 | 0.460 |
| Average comfort, same window | 0.694 | 0.742 |
| Average mood, same window | 62.49 | 63.30 |
| Tavern consumption, same window | 0 | 5.70 |
| Festival drink consumption, same window | 5 | 9 |
| Strain at the same hour, 1199 | 6.878 | 6.242 |
| Victory day | 54.75 | 56.75 |
| Departures / deaths | 0 / 0 | 0 / 0 |

The window contains 47 hourly endpoint observations after hour 1152 and before hour 1200 (summer's end). All observations begin from an 18-settler colony. The comparison continues into autumn to observe the charter delay. Averages are observations of the resulting strategies, not isolated estimates for a single mechanic.

Both strategies win. Banking takes two fewer days. Thus this case supports the concern that the comfort benefit can be too small to justify the opportunity cost when finishing quickly is the objective. It does not prove that serving is always inferior, that summer drinks are universally unnecessary, or that the whole game's difficulty should increase.

## Accounting and limitations

Banking is not total abstention: five settlers drink at the day-50 festival, which also contributes to the recorded summer satisfaction. The service continuation serves nine festival drinks and consumes another 5.7 at the tavern. Its festival eases strain by about five rather than four. Consequently the 0.64 same-time strain difference cannot all be attributed to the seasonal comfort need. Generic drink memories, festival relief, different worker allocation and downstream random choices contribute too.

The present village need has equal weight with six other needs. Perfect summer drink satisfaction can therefore change comfort by at most one seventh, before secondary mood/behavior effects. With 18 settlers on day 49 and the current base strain settings, that full direct comfort difference reduces strain growth by approximately 0.20 per day. This is an instantaneous calculation holding everything else fixed, not a measured whole-run effect. Existing perks and event relief can further alter the practical comparison.

Only the last two days of one summer were compared from this checkpoint. A full-summer strategy and a different charter/production route may yield a different tradeoff. The next experiment should retain this locally understood case and add one earlier summer checkpoint, rather than expanding to a large unattended seed batch.

## Double-weight diagnostic

A second pair uses the same day-49 pre-intervention state and doubles only the summer drink need's relative weight in comfort. `START.seasons.summerDrinkWeight` defaults to one when unset; the value two is experimental and is not shipped as the normal balance.

| Relative weight / strategy | Average comfort | Same-hour strain | Victory day |
| --- | ---: | ---: | ---: |
| 1 / bank | 0.694 | 6.878 | 54.75 |
| 1 / serve | 0.742 | 6.242 | 56.75 |
| 2 / bank | 0.612 | 7.022 | 54.75 |
| 2 / serve | 0.707 | 6.297 | 56.75 |

Doubling the weight makes the comfort gap larger, but both strategies finish on the same days as before. This short, late-summer comparison does not justify increasing the requirement further. The starting camp has no drink need, so the experimental weight has no effect on that start or on other seasons.

## Earlier summer, longer exposure

A second closely watched case uses wardrobe/24757 under current spring recovery rules, without the fine-input intervention. It has a brewery and tavern by hour 1020 (day 43.5). Both continuations match exactly through that checkpoint. The explicit banking strategy closes the tavern during the rest of summer; the service strategy prioritizes its existing worker. Festivals can still serve drinks in both strategies. This is important: the ordinary bot was already serving in this earlier case, so simply leaving it unchanged would not have tested abstention.

| Observation | Bank during summer | Serve during summer |
| --- | ---: | ---: |
| Average drink satisfaction | 0.173 | 0.852 |
| Average comfort | 0.806 | 0.936 |
| Average mood | 68.91 | 71.42 |
| Strain at hour 1199 | 12.386 | 8.114 |
| Tavern drink consumption | 0 | 61.8 |
| Festival drink consumption | 15 | 11 |
| Berries consumed by brewery | 132.6 | 210.3 |
| Pie-oven pie production | 74.4 | 44.9 |
| Bakery pie production | 44.3 | 30.7 |
| Food-variety charter completion | Day 54.62 | Day 63.67 |
| Victory | Day 61.58 | Day 80.62 |
| Departures / deaths | 0 / 0 | 0 / 0 |

The summer window covers 179 hourly endpoints after hour 1020 and before hour 1200. Minimum stored food is about 52.2 in both. The service continuation was extended from its original day-66 observation cutoff to victory; the extension is a repeated replay of the same case, not another independent sample.

Regular service has a substantial comfort/strain benefit over the longer window, but it competes for both a worker and ingredients used by food production. Later events and decisions diverge, so the 19-day victory difference must not be attributed solely to the summer mechanic. The nine-day food-variety delay and observed ingredient/production flows identify a local opportunity cost worth investigating. A more efficient serving strategy might do better than this open-tavern policy.

## Next design question: repeated servings

Current tavern mechanics consume 0.3 drink units **each leisure hour** while stock lasts. `drankTonight` limits the drink memory/taste bonus to once per evening, but does not limit consumption. The summer need itself only asks whether a drink was consumed in the last 30 hours. A guest may therefore consume repeated servings after fulfilling the seasonal need, at continuing ingredient cost.

The user chose one serving per settler or less, with socializing continuing afterward. That change is implemented and the two watched configurations have been replayed; see [current serving behavior and results](tavern-servings.md).

The evidence so far supports a real tradeoff, not a verdict that summer drinks are universally too weak. They provide a meaningful safety/comfort margin in the longer case, while banking wins faster in both watched cases. Keep the normal summer weight at one and all bot experiment switches off while assessing the new serving baseline.

## Reproduction

Run in separate processes:

```sh
FORK_HOUR=720 FORK_POLICY=fine-inputs SERVICE_HOUR=1152 SERVICE_POLICY=bank WATCH=1 SEEDS=24757 RESULT_DIR=dist/drink-incentive/bank npx tsx tools/combined-seasons.ts taper 1 60
FORK_HOUR=720 FORK_POLICY=fine-inputs SERVICE_HOUR=1152 SERVICE_POLICY=serve WATCH=1 SEEDS=24757 RESULT_DIR=dist/drink-incentive/serve npx tsx tools/combined-seasons.ts taper 1 60
```

`tools/summer-service-check.ts` verifies the finale tradeoff, explicit summer banking, existing worker budget, seasonal expiry and famine precedence. `tools/summer-weight-check.ts` checks the weighted need, starting-camp isolation and winter isolation. TypeScript and build pass; the preceding construction experiment also passed rough-plank, spring-recovery and workshop-buffer/control/save checks. Add `SUMMER_DRINK_WEIGHT=2` to each late-summer command for the double-weight comparison. The earlier case uses:

```sh
SERVICE_HOUR=1020 SERVICE_POLICY=bank WATCH=1 SEEDS=24757 RESULT_DIR=dist/drink-incentive/early-bank npx tsx tools/combined-seasons.ts wardrobe 1 90
SERVICE_HOUR=1020 SERVICE_POLICY=serve WATCH=1 SEEDS=24757 RESULT_DIR=dist/drink-incentive/early-serve npx tsx tools/combined-seasons.ts wardrobe 1 90
```

Detailed artifacts are in `/workspace/research-audit/drink-incentive/`.
