# Comfort feedback: single-screen review prototype

The approved design is now integrated into the player game on `codex/comfort-feedback-prototype`. The HUD opens live settlement history, and balanced rewards are enabled for new and resumed playing settlements. The standalone prototype remains available for reviewing illustrative states.

The compact comfort button opens one screen containing the current level, active rewards, all three rolling tracks and their requirements, concise improvement hints beside tracks below their requirements. The reward ladder lists each level and its active/locked state within that same screen; there is no separate next-level card. There are no tabs, separate after-charter section or charter forecast link. A short explanation notes that requirements rise as charters are completed.

Examples cover one, two and three active tracks, a village housing gap and an eight-hour warmup. Optional example controls adjust standing, averages and recorded history. These are labelled illustration data, not a live save. Scoring and reward calculations use the existing milestone helpers with balanced rewards; no scoring or balance rules change.

Native dialog behavior handles focus containment, Escape and return focus. The scrolling dialog keeps its close header available. Offline checks at 1440, 390 and 320px cover the single-screen flow, rewards, warmup, standing thresholds, equality, keyboard interaction and viewport fit.

```sh
npm run prototype:comfort-feedback
npm run test:ui:comfort-feedback
npm run typecheck
```

Prototype output: `dist/comfort-feedback/index.html`. Playable game: `dist/site/index.html`. Run `npm run test:ui:comfort-game` against the built game served on localhost:8769 to check the integration at desktop and phone sizes.

Existing playing saves without milestone history begin recording when resumed; no past comfort is invented. Saves with history retain their history and separate bonus RNG. Completed settlements stay unchanged. Normal player games always select balanced rewards; raw simulation worlds remain configurable for historical control experiments. The existing continuous strain curve is unchanged.
