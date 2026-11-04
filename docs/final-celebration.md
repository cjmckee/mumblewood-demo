# Final charter celebration

Branch `codex/final-charter-celebration` starts from `main` after PR #22. The comfort experiments remain on their separate branch.

Completing either final charter now opens a third woodland celebration instead of the plain victory card. The 3.2-second scene raises a hall or lights the feast pavilion, gathers neighbours around a table, lights lanterns and unfurls the town banner. The illustration uses the existing game palette and vector art, with a dedicated hall drawing. The first two charter scenes keep their timing and flow.

The final card names the town and completed charter, thanks the player, and highlights actual counters from the finished world:

* Day the town was founded, living settlers, buildings raised and meals eaten.
* Expandable charters completed, peak population, couples, breakups, errands, recoveries, departures, deaths and festivals.
* The browser's existing run ledger.

“Start a new settlement” works immediately, including during animation. It records the completed run before resetting, preserves the ledger and preferences, creates a fresh world/seed, clears old dialogs and placement state, and restores normal play speed. “Look around your town” hides the card and offers a return button. The finished simulation stays stopped, and gameplay commands cannot alter its recorded result during inspection.

## Reload and motion

Winning worlds are now retained by the existing save slot until the player starts again. Reload opens the final illustration and stats without replaying the animation or adding a duplicate ledger entry. A stable result key prevents double recording; an immediate restart also records the result before the old world is replaced. In-progress saves retain the welcome-back flow, collapsed runs still clear the slot, and old save data needs no schema-version migration.

Live redraws and inspection preserve elapsed animation time. The operating system's reduced-motion preference and the game's calm setting show the completed illustration. Stats and actions are never gated by animation. Keyboard focus stays in the dialog, expanded stats survive redraws, and colony names remain escaped.

## Preview

```sh
npm run build
npm run prototype:finale
```

`dist/final-prototype/index.html` is a self-contained presentation preview with Hall/Long Table, Replay and Reduce motion controls. Its numbers are explicitly labelled sample stats, not an actual playthrough. Starting again there creates a fresh preview world without touching a player's saved game; inspection is described rather than pretending to render the town map. The actual game build uses the real restart and inspection controls.

Private phone preview: https://mumblewood-charter-preview.plentifulapple.chatgpt.site/finale.html

## Verification

```sh
npm run check
python -m http.server 8767 --bind 127.0.0.1
npm run test:ui:finale
UI_URL=http://127.0.0.1:8767/dist/site/index.html npm run test:ui:charter
CHROMIUM_PATH=/usr/bin/chromium UI_URL=http://127.0.0.1:8767/dist/site/index.html node tools/save-check.mjs dist/save-check
```

The final browser checks exercise actual charter completion through the simulation for both routes, real statistics, animation continuity, reduced motion, viewport fit at 1440/390/320px, inspection without mutation, save/reload, one ledger entry, keyboard restart, clean new-game state and a same-JavaScript-turn win/restart. The presentation preview also loads offline. Focused save checks cover terminal-world persistence and replacement; existing charter and save/resume regressions cover the surrounding flow. The final scene does not alter charter rewards, conditions or balance.
