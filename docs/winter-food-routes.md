# Winter food: fishing, mushrooms and stored grain

## Finding

The watched evidence does not justify reducing fishing yields. Fishing is an easy route to establish, but it is not the only food route that can work through winter. A mushroom cellar supports year-round stew, and stored grain/flour support winter bread while field workers do other jobs. Initial capital, blueprint access, processing and staffing explain important differences before a yield change is needed.

This investigation makes no simulation or balance changes. It adds a production probe and a labeled blueprint-access case. Prior bot, spring and tavern-serving fixes remain in effect.

## Controlled production cases

`tools/winter-food-probe.ts` uses soil-equipped seed 8919 with eight settlers, starting summer 1 at hour 6, for 40 elapsed days. It grants ready buildings, normalizes job skills to five, and fixes the town at settlement standing. Recruitment, charter choices, cornerstones and story-event decisions are discarded; timed story events are disabled. Ordinary movement, hauling, cooking, eating, home fuel, illness, recovery and relationships still run.

Every case has the same initial 100 wood, 30 berries and 40 stew, two 250-unit storehouses plus starting storage, beds for eight, a dining hall and a clinic. There are four food-production assignments, one woodcutter and one doctor, leaving two general laborers. Wood production uses a warehouse target of 80 to avoid filling all shared storage with wood. Buildings and starting resources are grants, not construction earned during play. These are ready-to-operate production comparisons, not normal bot games or win-rate samples.

| Food route | Food assignments | Route construction cost omitted by fixture |
| --- | --- | --- |
| Fish → kitchen stew | 2 dock, 2 kitchen | 33 wood |
| Mushrooms → kitchen stew | 2 cellar, 2 kitchen | 30 wood + 5 fine materials |
| Grain → flour → bread | 2 field, 1 mill, 1 bakery | 41 wood + 10 fine materials |

All route buildings have efficiency 1 on this map. Only the selected recipes run; fallback recipes are disabled. Source and processing buildings are placed using the game's normal placement search, so actual walking and delivery paths remain part of the comparison. All three cases keep eight settlers, with no deaths, departures, sampled cold exposure or food-shortage hours below two warehouse food units per person.

### First winter

| Observation | Fish | Mushrooms | Grain, fixed jobs |
| --- | ---: | ---: | ---: |
| Raw source output | 148.3 fish | 118.1 mushrooms | 0 grain |
| Cooked output | 138.9 stew | 90.8 stew | 132.7 bread |
| Actually eaten | 74 stew | 74 stew | 75 bread |
| Minimum warehouse edible food | 547.5 | 577.5 | 122.2 |

The continuous routes fill shared storage during autumn/winter. Their later production is constrained by stock/hauling/output space, so this table is **not** an intrinsic throughput ranking. During the first summer, before stocks become as large, fish and mushrooms produce approximately 363 and 349 raw units with 276 and 260 stew respectively. Bread output is about 129 with its two processing workers split between milling and baking. Different job skills were normalized, but traits, illnesses and subsequent random outcomes can still differ.

The capital difference matters in ordinary play: a dock needs no fine materials, while the cellar and grain route require an established construction-material supply. Fishing also provides raw edible food without a processing stage. Grain requires processing before it is edible. These are real advantages without a unique winter yield advantage over mushrooms: both dock and cellar retain their normal winter yield multiplier, while fields stop producing.

## Same-state grain staffing comparison

A second grain continuation matches the fixed-job case byte-for-byte at hour 480, winter's start, including world RNG. All pre-winter hourly observations match. It then releases the two field workers to general hauling and returns them to the field in spring. No extra workers, stock or rates are granted.

| Winter observation | Fixed field assignments | Workers released for hauling |
| --- | ---: | ---: |
| Food-production assignments | 4 | 2 |
| Recorded time working at a dormant field | 145 hours | 0 |
| Bread produced | 132.7 | 134.8 |
| Bread eaten | 75 | 74 |
| Ingredient pickups | 42 | 62 |
| Output pickups | 67 | 81 |
| Deaths / departures | 0 / 0 | 0 / 0 |

The route keeps operating with two fewer production assignments. Their hauling helps keep processors supplied; the time is available for useful work instead of standing in a zero-yield field. These counts include actual pickup transitions and do not measure all travel or prove an optimal allocation.

Warehouse stocks illustrate the winter drawdown:

| Stock | Winter start, both | Winter end, fixed | Winter end, released workers |
| --- | ---: | ---: | ---: |
| Grain | 277.1 | 115.9 | 89.4 |
| Flour | 61.4 | 92.2 | 109.7 |
| Bread | 97.6 | 141.4 | 145.8 |

Grain is being converted into flour and bread while the field produces nothing. The simulation already supports that winter strategy without a preserves chain. The initial preparation and storage are generous by design; these probes do not establish when a player can afford the route or how little reserve is sufficient.

## Bot access check

One additional ordinary-bot case uses seed 8919 with the same recruitment taper and grants **only the cellar blueprint** at the start. It grants no resources, buildings or workers and imposes no ban on fishing. This changes later draft offers, events and decisions, so it is not an otherwise-identical whole-run control.

The bot builds the cellar on day 25.75 and does not complete a dock until day 44.29. Through the first winter it produces 98.1 berries and 84.5 mushrooms, no fish, and settlers eat 97 stew. It wins on day 45.33. This demonstrates that the bot can use another actual food source when access differs; it does not rank this strategy against the normal fishing run.

Three settlers die of frontier flu on day 12, before the cellar is built and before winter. Their preceding action records show severe contagious illness while being fed, not starvation. These deaths must not be attributed to mushroom production or hidden in a success statistic. The trace also shows an urgent-care planning concern: the clinic blueprint was owned, but construction was repeatedly deferred behind the charter's sawmill/carpenter chain, and the clinic completes on day 12.5. That is a separate survival-priority investigation.

## Next steps

Follow-up completed: [seasonal staffing and urgent care](care-and-seasonal-staffing.md) are enabled. The clinic investigation also identifies a remaining bed-allocation decision. The original route probes below do not incorporate these later bot priorities.

Keep fishing and other food yields unchanged. Before judging full bot strategies, check winter staffing of zero-yield fields, orchards and apiaries, plus urgent clinic construction when settlers are bedridden. The controlled probe deliberately held jobs fixed before testing reassignment; it does not itself prove that every normal bot leaves farmers at dormant fields. Existing `blockedReason`/staffing code should be audited with a focused case.

Once those actions are credible, compare ordinary route setup costs and winter reserve requirements on another watched map. The present probes use one soil-equipped map, shared generous capital and no timed story-event pressure. They support viability and mechanism understanding, not a general balance verdict.

## Reproduction and validation

```sh
RESULT_DIR=dist/winter-food/ready npx tsx tools/winter-food-probe.ts 8919 40
FOOD_ROUTE=grain WINTER_REDEPLOY=0 RESULT_DIR=dist/winter-food/grain-fixed npx tsx tools/winter-food-probe.ts 8919 40
FOOD_ROUTE=grain WINTER_REDEPLOY=1 RESULT_DIR=dist/winter-food/grain-redeploy npx tsx tools/winter-food-probe.ts 8919 40
EXTRA_BLUEPRINTS=cellar WATCH=1 SEEDS=8919 RESULT_DIR=dist/winter-food/access npx tsx tools/combined-seasons.ts taper 1 90
```

The grain-fixed rerun is a repeated diagnostic replay, not another independent sample. The probe checks no unintended recruitment, nonnegative food and elapsed-time accounting; all three base cases cover exactly 960 hours. Full checkpoints and pre-winter observations were compared for the grain pair. TypeScript, existing recipe and route checks pass. Artifacts are in `/workspace/research-audit/winter-food/`.
