# Comfort feedback: single-screen review prototype

This presentation prototype lives on `codex/comfort-feedback-prototype`. It does not wire a new HUD into the game or enable milestone rewards for normal settlements; integration follows review.

The compact comfort button opens one screen containing the current level, active rewards, all three rolling tracks and their requirements, concise improvement hints beside tracks below their requirements. The reward ladder lists each level and its active/locked state within that same screen; there is no separate next-level card. There are no tabs, separate after-charter section or charter forecast link. A short explanation notes that requirements rise as charters are completed.

Examples cover one, two and three active tracks, a village housing gap and an eight-hour warmup. Optional example controls adjust standing, averages and recorded history. These are labelled illustration data, not a live save. Scoring and reward calculations use the existing milestone helpers with balanced rewards; no scoring or balance rules change.

Native dialog behavior handles focus containment, Escape and return focus. The scrolling dialog keeps its close header available. Offline checks at 1440, 390 and 320px cover the single-screen flow, rewards, warmup, standing thresholds, equality, keyboard interaction and viewport fit.

```sh
npm run prototype:comfort-feedback
npm run test:ui:comfort-feedback
npm run typecheck
```

Output: `dist/comfort-feedback/index.html`. The next step after review is to connect the accepted screen to actual milestone history in the game, then enable the agreed system once the session’s comfort work is finished.
