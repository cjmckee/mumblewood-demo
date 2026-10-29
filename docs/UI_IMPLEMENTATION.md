# UI polish implementation

Implemented the [UI audit](UI_AUDIT.md) in focused commits, with character portraits after the information and interaction changes. Changes are local commits on the working branch; nothing has been deployed.

| Commit | Change |
| --- | --- |
| `f0d9585` | Original audit and before screenshots |
| `9f93164` | Complete food controls, accurate building states, actual trade quantities and collapse reason |
| `6198bbf` | Preserve focus and per-view scrolling; accessible, keyboard-contained dialogs; pause during inspection dialogs |
| `29cc0b2` | Actionable issues, affected-person lists, resource sources, workplace choosers, map warning badges |
| `d9d37d7` | Colonist triage, filters and sort; needs before biography; existing-building management before catalog browsing |
| `c13e2d6` | Separate charter requirement meters, shorter decision cards, touch-accessible help, recipe sources, storage customization, placement range and door indicators |
| `68f9a9c` | Navigable ledger flows and temporary event effects; browser regression coverage |
| `66e295f` | Completed/empty states, linked personal complaints, save-check support for local HTTP previews |
| `857cb8f` | Stable vector portraits, matching map appearance, consistent identity across recruitment, rosters, detail, staffing, errands and relationships |
| Final polish commit | Remove duplicate remedy buttons, expose personal remedies, preserve placement focus, fix keyboard cancellation, make room for the map on phones, label all fine materials accurately, document checks and final screenshots |

## Result

- Issues have concise titles, optional evidence, specific remedy buttons, and links to affected colonists. Navigation does not spend resources or change jobs.
- Remedy destinations adapt to the colony: existing workplace, construction site, available building, prerequisite research desk, or missing blueprint.
- Resource chips open named information and source links. Ledger job types lead to a workplace chooser with location and staffing. Individual flow rows open their relevant source or destination.
- Colonists show urgent illness, actionable concerns, mood direction, home/workplace links, and needs first. Skills, traits, full thoughts, preferences and relationships remain available on expansion.
- Building management supports open-job, blocked, low-efficiency and construction filters. The catalog is a separate view grouped by purpose, with missing materials highlighted.
- Charter requirements have independent progress indicators and relevant destinations. Recipe states and inputs are explicit. Storage has a capacity meter, presets and optional item-level filters.
- Optional help and forecasts pause the simulation and say so. Dialogs isolate their background, retain focus, reset scrolling for new content, and support keyboard dismissal when optional.
- On phones, the large status card hides during panel inspection; resources, time, and the management tabs remain accessible. Closing the panel restores the full goal/status display.
- Portraits are derived from existing saved identity. Hair, face shape, glasses, freckles, facial hair and clothing vary without using simulation randomness or requiring a save migration. Temporary mood/illness indicators remain separate.

## Validation

- `npm test`: presentation-state regressions, prerequisite navigation, recipe-off labels, capped sales, separate charter requirements, and 60 distinct sampled portraits that survive JSON save round-trips.
- `npm run check`: TypeScript passes.
- `npm run build`: standalone and production HTML build successfully.
- `npm run test:ui`: desktop 1440×900, phone 390×844, and small phone 320×640. Covers food reservations, accurate building states, scroll/focus continuity, dialog semantics and keyboard behavior, navigation to staffing, navigation without mutations, illness/job remedies, long decisions, horizontal fit, portrait consistency, capped trades and placement cancellation. No page errors in the checked states.
- Existing save/resume/restart browser checks: all passed.
- Existing recipe preference, fallback and toggle checks: all passed.
- `git diff --check`: passes.

Browser checks use Chromium/Playwright; the screenshots include bot-played sample colonies. They are review evidence, not exhaustive coverage of every possible late-game state or browser.

## Review screenshots

| Surface | Desktop | Phone |
| --- | --- | --- |
| Roster | [View](ui-after/desktop-colonists.png) | [View](ui-after/phone-colonists.png) |
| Issues | [View](ui-after/desktop-issues.png) | [View](ui-after/phone-issues.png) |
| Building management | [View](ui-after/desktop-build.png) | [View](ui-after/phone-build.png) |
| Ledger | [View](ui-after/desktop-ledger.png) | [View](ui-after/phone-ledger.png) |
| Colonist detail | [View](ui-after/desktop-person.png) | [View](ui-after/phone-person.png) |

[Portrait variation sheet](ui-after/portraits.png)
