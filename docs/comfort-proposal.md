# Comfort: stronger consequences and clearer transitions

## Agreed direction

Make the existing comfort system more impactful and easier to understand before adding goods or production chains. Comfort measures living conditions and controls future strain growth. Personal wants affect mood separately. Current comfort balance is unchanged by the charter celebration work below.

## Balance experiment — implemented, opt-in

The latest [milestone prototype](comfort-milestones.md) explores a separate hypothesis: rolling homes/meals/evenings thresholds, rising charter expectations, and cumulative strain/speed/double-output rewards. It includes a playable phone preview and reward comparisons. It remains opt-in, alongside the continuous-curve experiments below; neither system has been selected as the final balance.

The current normal multiplier is `1.4 − comfort`. For ten settlers around day 20, moving from 60% to 90% comfort saves about two strain points over ten days, assuming the conditions remain fixed and no other modifiers or relief. That can be hard to perceive beside direct mood effects.

The prototype now supports the proposed curve and a gentler comparison. The shipped default remains linear. See [the experiment and results](comfort-curve-experiment.md). The proposal uses a continuous curve through these points:

| Comfort | Strain growth multiplier |
| --- | ---: |
| 30% | 1.8× |
| 60% | 1.0× |
| 90% | 0.3× |

These are candidate tuning values, not established balance. In the same fixed-state example, the 60% → 90% improvement would save roughly five strain points over ten days. The experiment uses linear interpolation between points and positive, bounded endpoints. Prioritize the reward for sustained good provision; monitor whether stronger low-comfort penalties create an unrecoverable workforce/mood spiral.

Keep festivals and charter completion as relief for existing strain. Do not introduce passive strain recovery in the first curve experiment. Existing homes, meals, tables, variety, healthcare, entertainment, beauty and heating provide enough choices to test this direction.

Compare matched comfort-first and charter-first strategies. Measure strain, mood, departures, staffing and resource opportunity costs, recovery after a bad period, and completion time. Both strategies should remain viable. Add content only if a specific need has no practical response or one investment dominates every decision.

## Feedback proposal — follow-up

Show comfort, current strain growth and the weakest actionable needs together. Explain the return on an improvement. Preview the next standing's expectations before charter completion so players can prepare. The new completion card explains the change at the moment it occurs; it does not replace advance warning.

## Charter celebration — implemented

After the first and second completed charters, show a paused card before the next choice:

1. Celebrate the completed charter and the colony's new standing, with the game's building art in an animated woodland scene.
2. Show gold already received, actual strain before/after relief, and the upcoming cornerstone choice.
3. Explain new comfort needs and increased housing/meal standards. Seasonal changes appear only when they become newly relevant. Show the separate increase in unmet personal-want mood cost.
4. Continue to the existing choices; the next charter is still chosen before its cornerstone.

The acknowledgement is saved with the decision queue. Reloading or inspecting the colony cannot replay rewards. The third charter retains the victory screen. The player can inspect the colony while the card waits; simulation remains paused. Existing saves need no migration and do not receive retrospective cards.

Review: `npm run build && npm run prototype:charter`, then open `dist/charter-prototype/settlement.html` or `village.html`. The pages are standalone presentation previews with Replay, Settlement/Village and Reduce motion controls. They use the same card and scene components as the game, without WebGL, game startup, local storage or external assets. Actual completion is covered by `tools/charter-transition-check.ts`. Serve the repository on port 8765 and run `npm run test:ui:charter` for browser checks and screenshots.

## Visual celebration — first pass implemented

A 2.4-second SVG/CSS scene now plays in the celebration header:

- Camp → settlement: a cottage appears beside the camp, settlers gather around the hearth, a lantern lights, and a settlement banner unfurls.
- Settlement → village: more homes and flowers appear, another settler arrives, lanterns light and a village banner unfurls.
- Motion finishes in 2.4 seconds, leaving the illustrated rewards/expectations card. Important text and Continue are available throughout.
- Uses the existing vector building art and CSS/SVG motion. Bespoke character animation and sound remain possible follow-up polish.
- System reduced motion and the game's calm setting show the finished illustration immediately. Resumed cards also show the final scene. Live redraws preserve elapsed time, and inspecting the colony does not restart the sequence.
- Retains the same saved acknowledgement and reward data; the illustration grants no buildings and changes no simulation timing or payouts.

The comfort curves are now opt-in experiments; advance warning remains a proposal. Run `npm run test:ui:charter-animation` after building the game and preview (with the repository served locally) to check motion, redraw continuity, early Continue, inspection, offline preview and reduced motion. `PREVIEW_ORIGIN` selects a local server other than `http://127.0.0.1:8765`. The check captures exact-timestamp frames for animation recordings in `dist/charter-prototype/frames/`.
