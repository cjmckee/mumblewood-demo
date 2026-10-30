# Bot production policy

The player and bot share the same starting woodcutter recipes: three-star wood gathering, or one-star rough planks at 3 wood per plank. Gathering wins recipe preference while both are enabled; players can switch gathering off to select planks. A sawmill is the efficient drafted upgrade: 2 wood per plank and a higher nominal production rate.

The default bot uses rough production only for unmet fine-material construction demand. It starts a batch at 35 stored wood, stops below 20, and uses at most one hut at a time. It targets about 12 rough planks across the run, checked hourly, so a small overshoot is possible. It stops earlier if demand is covered or a usable dedicated maker exists. The budget is a bot policy, not a limit on the player.

After spending the early budget, the bot favors a usable sawmill/carpenter/kiln blueprint, can buy a suitable upgrade from a trader, and prioritizes building an owned upgrade while retaining food/housing/storage priorities. Other huts can continue gathering wood. This limits the primitive method's wood and labor cost rather than letting it service a whole monument indefinitely.

Rough planks are delivered from batches of at least one unit. This prevents a stopped two- or three-plank batch from waiting for the usual four-unit hauling threshold. Normal dedicated workshop hauling is unchanged.

`BOT.roughPlanks=false` disables the bot's fallback without removing the player recipe. `roughPlankBudget`, `roughWoodStart`, `roughWoodStop` and `roughKeepWinterReserve` remain available for controlled experiments. Do not treat these settings as independent effects unless comparison arms hold the others fixed.

Four ordinary fixed-seed runs won on days 42.33, 48.38, 43.54 and 45.75, with rough output 0, 1.07, 12.39 and 0 respectively. Eight granted-clothing-route comparisons also won under bounded and unlimited policies, but the bounded policy was not uniformly faster: one leather case took about 15.75 days longer, while one textile case finished about 9.4 days earlier. Later choices and RNG diverge; these are whole-path outcomes, not causal estimates of one plank's value.

Validation: `npx tsx tools/rough-planks-check.ts` (15 checks), browser manual recipe/production/save-resume check, type check, build and the existing simulation checks. Current reproduction commands and paired data are retained for this task at `/workspace/research-audit/clothing/tuned-bots/final/findings.md`.

## Fine-material planning

The planned rough-demand and supplier-chain fixes are now enabled by default. The bot chooses one available fine-material route and can start its suppliers before the charter building exists. See [the three watched comparisons](fine-material-planning.md). Other optional strategy experiments remain off.

## Food-variety reservations

The bot now checks recipe supply feasibility and prefers charter stocks already in storage when choosing meals to reserve. Imported food and complete ingredient batches remain useful. See [watched food-variety comparisons](food-variety-planning.md).

## Seasonal staffing and urgent care

The bot releases zero-yield seasonal jobs, prioritizes an affordable clinic during bedrest, and reserves a healthy medic who can actually provide treatment. The normal wood buffer remains. See [watched care and seasonal staffing cases](care-and-seasonal-staffing.md).

## Clinic admissions

Critical illness can displace noncritical patients. Noncritical cases are first come, first served, and displaced patients retain their queue position. Clinic cards show who is waiting so players can manage capacity. See [admissions and validation](clinic-admissions.md).
