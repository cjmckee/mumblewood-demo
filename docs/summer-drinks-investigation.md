# Summer drinks: construction dependencies before balance changes

The next seasonal investigation follows the same map/seed, with current spring recovery rules. The no-grant taper/24757 baseline and the separately labeled wardrobe/24757 case were watched through day 51. The wardrobe case grants clothing blueprints only. Hourly traces now include actual decision/build explanations, owned blueprints and construction sites as well as worker assignments, inventory and carrying transitions.

## Baseline blocker

In taper/24757, the brewery blueprint is owned by spring, but no drinks reach settlers during the observed second summer. The active food-variety charter needs a pie oven. Construction waits for fine materials before placing it, while the bot's rough-plank fallback normally waits for already-placed sites before recognizing their demand. It therefore gathers wood instead of starting the existing plank recipe.

The colony later drafts and builds a kiln. **The kiln costs wood only**, so the absence of fine materials does not prevent its construction. However, it cannot run without clay. The clay pit is blocked behind the pie oven because the construction priority rule does not recognize the kiln's supplier as an indirect part of that charter chain. The result is a second dependency loop: pie oven → bricks → kiln → clay pit, with the clay pit held back for the pie oven.

At day 41 the colony has over a thousand wood, zero fine materials, an idle kiln waiting for clay, and no pie oven, brewery or tavern. This is evidence of planning failures, not an expensive drink recipe or a harsher seasonal need.

## Same-state candidates

All continuations replay the original history to hour 720 (day 31), preserving internal caches rather than restoring just a world JSON. World, decision RNG, seasonal settings and shared bot settings match at the fork. Control and fine-input checkpoints match completely; the earlier rough-demand checkpoint predates the additional disabled `fineInputs` setting, which is the only settings-schema difference.

Two separate experimental switches remain **off by default**:

- `BOT.plannedRoughDemand`: include missing buildings in the charter route and one available fine-material upgrade when calculating rough-plank demand. Existing wood safeguards and the hourly rough-work budget are retained. This does not create materials or change rates.
- `BOT.fineInputs`: when missing charter construction needs fine materials, include the owned fine-material production route and its suppliers among allowed priority construction. Immediate shelter, raw food and storage needs retain precedence. This candidate does not enable planned rough work.

| Observation by day 51 | Control | Planned rough demand | Fine-material suppliers |
| --- | ---: | ---: | ---: |
| Rough planks produced | 0 | 14.10 | 0 |
| Food-variety charter completed | Not yet | Day 33.33 | Day 45.58 |
| First completed pie oven | None | Day 32.33 | Day 41.33 |
| First completed clay pit | None | None | Day 37.46 |
| First completed brewery | None | Day 47.29 | Day 46.67 |
| First completed tavern | None | None | Day 46.58 |
| Second-summer drink satisfaction | 0 | 0 | 0.007 |
| End population | 15 | 16 | 18 |

The supplier candidate gathered 27.27 clay and produced nine bricks. All continuations have no deaths or departures. They intentionally stop at day 51; these cutoffs are not losses. The rough-work budget remains an hourly soft check, so the recorded 14.10 is possible despite its nominal 12-plank setting.

These are three continuations of one state, not independent balance samples. Population, later charter choice, event outcomes and staffing diverge. The progression improvements do not establish a general speedup, and the higher population reinforces that recruitment taper is not a hard cap.

## The next actual tradeoff

After the supplier candidate completes the variety charter, it selects the Long Table finale. By days 49–50 it has drinks and brewery production, but the tavern is unstaffed. Staffing explanations show workers allocated to the finale's meal/drink chains; the drink-banking behavior also aims to preserve finale supplies. Merely having a brewery and tavern therefore does not ensure daily summer service.

Before changing drink rates or seasonal comfort values, decide which bot strategy represents intended play: maintain modest daily tavern service and bank the surplus, or permit a temporary comfort sacrifice while banking for the finale. The user clarified that the goal is an incentive to serve drinks rather than forcing service. The resulting [same-state incentive comparison](drink-incentive.md) measures both strategies under unchanged game rules; it leaves all experimental switches off by default.

## Reproduction and checks

Run each policy in its own process with current spring rules:

```sh
FORK_HOUR=720 FORK_POLICY=control WATCH=1 SEEDS=24757 RESULT_DIR=dist/summer/control npx tsx tools/combined-seasons.ts taper 1 50
FORK_HOUR=720 FORK_POLICY=rough-plan WATCH=1 SEEDS=24757 RESULT_DIR=dist/summer/rough-plan npx tsx tools/combined-seasons.ts taper 1 50
FORK_HOUR=720 FORK_POLICY=fine-inputs WATCH=1 SEEDS=24757 RESULT_DIR=dist/summer/fine-inputs npx tsx tools/combined-seasons.ts taper 1 50
```

The runner resets intervention switches between seeds. `tools/fine-inputs-check.ts` reproduces unrecognized planned rough demand and the supplier construction mismatch, while confirming that the fallback budget remains enforced. TypeScript, build, rough-plank, spring-recovery and workshop-buffer/control/save checks pass. Artifacts are in `/workspace/research-audit/summer-drinks/`.
