# Workshop logistics and production controls

Production workshops keep up to **24 ingredient units total** and **15 finished output units total**. Research desks use their existing separate supply rules.

Ingredient trips provision complete recipes in their actual proportions. The target is up to twelve outputs, bounded by input space, output space and available ingredients. Workshops refill below two complete outputs. A pie oven will not fetch wood for pies when no berries can complete the batch. Ingredients on the way are accounted for, and the pickup/delivery checks react to changed recipes or shortages. Unused or obsolete ingredients return to storage physically; no global downstream-demand inference is applied.

In a building's recipe panel:

- Use ↑/↓ to set recipe priority, or tap a recipe to switch it off. Explicit priority overrides stars; otherwise the existing star preference applies. The workshop falls back to another eligible recipe if the higher priority one lacks a complete batch.
- Set a **warehouse stock target** for each output. The target belongs to this workshop. Blank is unlimited; zero pauses that output.
- Only combined warehouse stock counts. Finished goods at workshops, ingredients committed to production and personal coats do not count. Production resumes when stock falls below the target. Goods already produced may later be delivered and put warehouse stock above the target.
- Another workshop can have a different target for the same output. Two recipes making the same good at one workshop share its target.

Priorities, targets, ingredient/output buffers and in-flight work survive save/resume. No recipe prices or production rates were changed for this feature.

Four fixed-seed ordinary runs compared old logistics with the new batching: ingredient pickups dropped 1344→1007, weighted load rose 6.03→7.23 units, and there were 25 extra unused-input return trips. Output pickups rose, so the reduction across monitored ingredient/output/return pickups was about 7%, not 25%. All eight won; completion times moved both ways, and later events/decisions diverged. These are diagnostic cases, not human pacing targets or a general win-rate estimate.

Checks: `npx tsx tools/batching-check.ts`, `npx tsx tools/workshop-buffer-check.ts`, type check, build, existing simulation suites and browser controls/save verification. `tools/logistics-probe.ts legacy` and `batch` reproduce the fixed-seed comparison; detailed task artifacts are in `/workspace/research-audit/logistics/findings.md`.
