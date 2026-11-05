# Comfort feedback: review prototype

This is a presentation prototype on `codex/comfort-feedback-prototype`, built from merged `main`. It does not wire a new HUD into the game or enable milestone rewards for normal settlements. That integration follows review of the prototype, as requested.

The page uses the existing game palette and icons, an illustrative settlement, and the shared `milestoneView` / `milestoneRewards` helpers with balanced rewards. Example averages are clearly labelled; they are not a live save or a forecast of changing provision. No browser save is read or written.

The proposed flow:

1. A compact comfort button shows the level, active-track count, three track icons and earned rewards. It opens a focused dialog.
2. **Comfort now** shows each trailing average, its requirement, whether the track is active, the next reward and a hint for the nearest missing track. A marker on each score bar makes the threshold visible.
3. The charter card carries a concise before/after warning. **After this charter** compares the same averages against the next standing's thresholds, identifies tracks that stop qualifying and names the lost reward. It is explicitly conditional on today's provision.
4. Warmup states explain the remaining history needed and do not claim active rewards or a reliable reward forecast. Village/final-charter states do not promise another rise in requirements.

Examples cover one active track, two tracks with a projected drop from II to I, all three tracks remaining active, a village housing gap and an eight-hour warmup. Optional example controls let reviewers adjust the standing, averages and recorded hours. Equality at a threshold qualifies, using the same rules as the engine.

Native modal behavior handles focus containment, Escape and return focus. Keyboard arrows move between tabs. Layout fits desktop and phone widths, with a scrolling dialog and persistent close header. UI copy explains rolling provision and cumulative rewards; no changes to scoring, thresholds, reward values or the underlying comfort curve are included.

```sh
npm run prototype:comfort-feedback
npm run test:ui:comfort-feedback
npm run typecheck
```

The standalone output is `dist/comfort-feedback/index.html`. Browser checks run offline at 1440, 390 and 320px, covering compact indicators, current/future track activation, lost-reward copy, stable/warmup/final-charter examples, threshold equality, keyboard tabs, focus restoration and page overflow. The prototype is self-contained and has no external assets.

Once the layout and copy are accepted, the intended next work is to connect these views to actual milestone history in the main HUD and charter flow, test live updates/save continuity, then enable the agreed comfort system for regular settlements when the session's comfort work is finished.
