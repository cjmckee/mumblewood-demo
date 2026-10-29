# One tavern serving per settler each evening

Regular tavern service now consumes at most one serving per settler per evening: 0.3 drink units, or 0.2 with Cellaring. The existing `drankTonight` flag resets at 18:00 and survives save/resume. It is personal, so visiting another tavern cannot bypass the limit. The guest receives the existing first-drink mood/taste benefit and fun increase, then continues gaining ordinary social fun without another charge. Later social hours do not refresh the drink timestamp or invent summer-need credit.

A staffed tavern remains a social destination after its stock runs out. Guests can socialize there without drinking. Serving is checked at the tavern the guest actually visits, including when a colony has multiple taverns. The building's description explains the new behavior.

This change limits regular tavern rounds. Festivals and finale celebrations retain their separate existing event costs. No drink production rate, summer need weight, charter requirement or bot-policy default was changed.

## Focused checks

`tools/tavern-serving-check.ts` exercises real ticks and checks:

- One serving across multiple leisure hours, with fun and tavern attendance continuing.
- The next evening permits another serving.
- No drink timestamp refresh after the serving, and no drink credit from empty-stock social time.
- Cellaring's smaller serving, including exactly 0.2 stock remaining.
- Empty-stock taverns and a second staffed tavern.
- Save/resume preserves the already-served flag.

TypeScript, build, summer-service/weighting, clothing/calendar/save, bedside-meal and workshop-buffer/control/save regressions pass.

## Watched strategy replays

The two existing configurations were replayed from the beginning under the new serving rule. Within each configuration, banking and serving match byte-for-byte at their intervention checkpoint, including world, bot settings, seasonal rules and decision RNG. Earlier history can differ from the historical repeat-drinking runs, so those old/new outcomes are not identical-state comparisons.

Both configurations use seed 24757 and current spring recovery. The earlier wardrobe case has the previously disclosed clothing-blueprint grant; the late taper case enables the same fine-input planning experiment in both continuations. Neither grants goods, workers or buildings.

| Current-rule result | Earlier bank | Earlier serve | Late bank | Late serve |
| --- | ---: | ---: | ---: | ---: |
| Intervention day | 43.5 | 43.5 | 49 | 49 |
| Average summer drink satisfaction | 0.173 | 0.901 | 0.035 | 0.545 |
| Average comfort | 0.807 | 0.936 | 0.694 | 0.755 |
| Average mood | 70.87 | 74.95 | 62.49 | 63.69 |
| Strain at hour 1199 | 9.595 | 8.142 | 6.878 | 6.221 |
| Tavern consumption during window | 0 | 30.9 | 0 | 5.7 |
| Festival drink consumption | 15 | 14 | 5 | 9 |
| Victory day | 83.75 | 64.42 | 54.75 | 56.75 |
| Departures / deaths | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

Earlier windows contain 179 hourly endpoints after hour 1020 and before hour 1200; late windows contain 47 after hour 1152 and before 1200. Banking closes the tavern during summer, so this comparison includes the cost of losing tavern socializing as well as withholding drinks. Festivals remain possible in both strategies. Later events, relationships, staffing and charter selection can diverge; the earlier continuations choose different finales. Completion-time differences must not be attributed solely to the summer drink need.

Historically, the longer serving case consumed 61.8 tavern drink units and achieved 0.852 satisfaction. Under the new rule it consumes 30.9 and achieves 0.901. The focused checks establish why repeated rounds no longer drain stock; the historical whole-run comparison by itself is not a causal estimate.

The current results support keeping voluntary summer service as a meaningful option while retaining banking as a situational strategy. They do not justify making drinks compulsory or increasing the requirement yet. Keep the normal summer comfort weight at one and the experimental bot policies off.

## Reproduction

These observations predate promotion of the fine-material planning fixes. To reproduce that planning baseline, run separate processes with the explicit legacy override:

```sh
FINE_PLANNING=legacy SERVICE_HOUR=1020 SERVICE_POLICY=bank WATCH=1 SEEDS=24757 RESULT_DIR=dist/tavern-serving/early-bank npx tsx tools/combined-seasons.ts wardrobe 1 90
FINE_PLANNING=legacy SERVICE_HOUR=1020 SERVICE_POLICY=serve WATCH=1 SEEDS=24757 RESULT_DIR=dist/tavern-serving/early-serve npx tsx tools/combined-seasons.ts wardrobe 1 90
FINE_PLANNING=legacy FORK_HOUR=720 FORK_POLICY=fine-inputs SERVICE_HOUR=1152 SERVICE_POLICY=bank WATCH=1 SEEDS=24757 RESULT_DIR=dist/tavern-serving/late-bank npx tsx tools/combined-seasons.ts taper 1 90
FINE_PLANNING=legacy FORK_HOUR=720 FORK_POLICY=fine-inputs SERVICE_HOUR=1152 SERVICE_POLICY=serve WATCH=1 SEEDS=24757 RESULT_DIR=dist/tavern-serving/late-serve npx tsx tools/combined-seasons.ts taper 1 90
```

Artifacts: `/workspace/research-audit/tavern-serving/`. These are two paired diagnostic cases, not a win-rate estimate. All four watched colonies contain one tavern; the focused regression separately covers a second tavern.
