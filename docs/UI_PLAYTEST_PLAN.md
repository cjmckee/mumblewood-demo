# UI playtest and follow-up plan

## Playtest scope

Ship the validated UI polish and portraits alongside the existing research-tree, clothing, clinic, and workshop changes on `main`. Keep the individual implementation commits and merge through a pull request. This plan defers usability decisions that need a human playtest; it does not defer known failing checks.

Included: complete food rules, accurate statuses/trade quantities, actionable issues and resource flows, colonist triage, building management filters, compact decisions and help, keyboard/focus/scroll fixes, and stable portraits matching map characters.

Integration preserves the latest main's research tree, coat ownership/wear information, clinic admissions/waiting list, complete-batch workshop buffers, recipe ordering, and per-workshop warehouse targets. A workshop meeting its target is shown as intentionally paused rather than incorrectly labeled “Recipes off.” Live refreshes preserve an unfinished target edit.

## First playtest

Play a fresh settlement through its first winter and at least two charters. If practical, continue an existing save too. Test desktop first, then try the same management tasks on a phone.

1. **Resolve problems from the UI.** Start from a warning for food, wood, beds, illness, or staffing. Follow its remedy without searching unrelated panels. Check affected people and return to the original task.
2. **Manage production.** Open a workplace from the ledger, assign a worker, reorder recipes, and set a warehouse target. Confirm that waiting for inputs, recipes switched off, and targets already met are distinguishable.
3. **Help a colonist.** Identify their main problem, reach the relevant remedy, compare job fit, and inspect their home, relationships, or treatment when useful. Check that portraits remain recognizable across screens and on the map.
4. **Follow progression.** Check individual charter requirements, choose research, inspect the research tree, and verify that seasonal clothing and clinic information remain easy to find.
5. **Try phone inspection.** Open and close panels, scroll resources, choose recruits, and use recipe/target controls. Check whether hiding the large status card during inspection helps or makes you lose track of the goal.
6. **Check pacing and continuity.** Inspect strain/festival/help, dismiss the dialog, resume play, reload, and continue the save. Note whether inspection pauses feel helpful or disruptive.

For an awkward interaction, record the starting screen, what you expected to click, where it actually led, and the extra steps required. For a bug, add the day/season, building/person involved, screen size, and reproduction steps; preserve the save if possible.

## Deferred decisions

| Priority | Question | Evidence to collect | Planned response if confirmed | Acceptance |
| --- | --- | --- | --- | --- |
| P1 | Do remedies take unnecessary detours? | Cases where a specific person/building is already known but the player reaches a generic chooser or wrong prerequisite | Carry the relevant entity and section through the destination; preserve useful return context | A known target opens directly; a chooser is used only when the player must choose between actual alternatives |
| P1 | Does compact information create too many clicks? | Repeated expansion of skills, thoughts, target controls, or comparisons | Keep frequently needed information visible in that workflow; consider remembered expansion per view | Staffing and comparison tasks do not require repeatedly reopening the same detail |
| P1 | Does the mobile status-card collapse hide the goal? | Losing track of a charter or threat while inspecting a panel | Add a compact goal/threat summary or a player-controlled collapse state | Goal and urgent risks remain discoverable without sacrificing usable map/panel space |
| P1 | Does late-game density become hard to scan? | A larger settlement with many concerns, duplicate workplaces, production chains and research options | Improve grouping, urgency ordering and filtering based on the observed bottleneck; add compact research filtering if needed | Urgent problems remain visible, destinations stay unambiguous, and long names/options fit |
| P2 | Do inspection pauses disrupt play? | Unexpected pauses or interruptions during ordinary management | Revisit which optional inspections pause; consider a preference while keeping mandatory choices paused | Pause behavior is predictable and visible; dismissing inspection restores the previous speed |
| P2 | Are new portraits recognizable at game scale? | Characters confused between recruitment, staffing and the map; poor contrast at phone sizes | Adjust silhouettes, contrast, or accessory scale using specific confusing examples | Characters can be followed across screens without relying only on shirt color |
| P2 | Is research-tree help usable by touch? | Research nodes requiring hover for a useful explanation | Add a tap/focus explanation for the existing tree rather than expanding all prose by default | Effects and prerequisites can be inspected with touch and keyboard |

Fix reproducible correctness, save, or blocked-action bugs immediately. Treat layout, disclosure, pause-policy, and art changes as follow-up commits driven by observations. This UI plan does not enable balance experiments or change recruitment, medicine, or production rates; those remain governed by the separate [main-branch merge checkpoint](merge-readiness.md).

## Merge checks

### Playtest feedback: charter panel size

The first mobile playtest found that expanded charter information used too much map space. The charter panel now has an explicit collapse/expand control, starts compact on phones, and remembers the player's preference independently of the game save. The compact view retains the charter name, overall progress, and concern count. Further mobile goal-visibility changes remain driven by playtest feedback.

- Run `npm run check` with main's complete state-check runner, including the UI state suite.
- Run browser UI regressions at 1440×900, 390×844, and 320×640, including recipe priority, target editing across refresh, portrait consistency, keyboard behavior and navigation.
- Run save/resume/restart browser checks against the integrated build.
- Require the pull request's simulation check workflow to pass before merge.
- After merging, confirm the GitHub Pages workflow succeeds and provide the live playtest URL.

The original [audit](UI_AUDIT.md) and [implementation record](UI_IMPLEMENTATION.md) contain the before/after evidence. They describe the earlier UI branch; this plan records its integration with the newer game features.
