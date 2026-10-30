# Mumblewood UI polish audit

Implementation follow-up: [completed changes and validation](UI_IMPLEMENTATION.md). This document records the original findings.

Audited October 29, 2026 against commit `6c59830`. This is an audit and proposed implementation order; gameplay and UI code have not been changed.

## Assessment

The game has a coherent visual foundation and useful diagnostic information. Its largest polish gap is connecting that information to the next action. Players can read what is wrong, but often have to remember the advice, find the right tab, find the right building or person, and reconstruct the solution themselves.

| Area | Current state |
| --- | --- |
| Visual identity | Established: restrained palette, consistent panels, readable primary buttons, building and item icons |
| At-a-glance information | Partial: progress bars and mood meters help; important problems are buried in panels |
| Concise copy | Needs a substantial pass: repeated instructions, paragraphs, and crowded secondary text |
| Problem → resolution | Major gap: notes, needs, ledger rows, and many warnings have no navigation |
| Colonist triage | Partial: lowest mood first is useful; causes, affected people, and remedies need stronger connections |
| Mobile interaction | Needs a pass: long panels, small controls, hover-dependent explanations |
| Character identity | Basic: names and shirt-color dots; defer avatars until the information work is complete |

## Highest-priority findings

### 1. Foreman's notes describe actions but cannot take the player there

`src/ui/ui.ts:785` renders the three highest-ranked concerns as static text. Examples observed include food spoiling, wood running low, raw meals, and missing dining tables. An arrow introduces the suggested action, but the suggestion is not interactive. The notes can occupy most of the colonist panel before the first person appears.

The advisor already provides structured `fixes`, and its gripe grouping already knows affected colonists (`src/sim/advisor.ts:16`, `:72`). The rendered concern loses the individual people and destinations.

**Recommendation:** compact issue rows with an icon, short title, affected count, and a specific action. `Wood low · 4d` → `Staff woodcutter`; `2 hungry` → affected people and the food source. Keep supporting evidence behind expansion. Expose an urgent issue count in the always-visible UI; keep a dedicated way to see concerns beyond the top three. Resolve destinations from the actual state: existing workplace, construction site, available blueprint, or prerequisite research. Opening a concern should navigate; spending resources or reassigning people should remain an explicit action.

### 2. The ledger ends where the player needs controls

`src/ui/ui.ts:793–827` shows resource flows, empty jobs, a best available worker, and laborer workload. All are static. In the reviewed desktop state, the ledger identified three open woodcutter slots and named a suitable person, but offered no way to inspect the workplaces or assign them.

**Recommendation:** make workplace rows open their staffing panels; when several buildings share a type, show a short chooser with location and staffing. Resource deficits should open their production/consumption breakdown with links to the sources. Put `net/day` and time remaining first; expand the accounting detail. Place the laborer warning beside staffing controls so the player can see the cost of taking another hauler.

### 3. Colonist details bury the reason to act

`src/ui/ui.ts:405–448` leads with identity, traits, preferences, and the full skills grid. Comfort, thoughts, relationships, and job assignment follow. An illness warning says to build a clinic and assign a doctor, but does not link to either. Relationship names, home occupants, patients, and current workers also lack inspection links.

**Recommendation:** lead with urgent conditions and the strongest actionable negative need, then provide the remedy beside it. Show need icons with meters and short states such as `No bed`, `Untreated`, or `Hates job`. Use mood direction alongside current mood. Move the full skills grid, traits, thought arithmetic, and relationship detail into expandable sections. Show the relevant skills when assigning work. Make people, homes, workplaces, and treatment destinations navigable wherever they appear.

Keep the low-mood sorting, but add a stable name/order option and filters for illness, hunger, no bed, sulking, and no job. Mood alone does not identify every urgent condition.

### 4. Food rules omit supported foods

`src/ui/ui.ts:399` hard-codes six foods. Apples, bread, and skewers are supported by the simulation but have no food-rule control. This prevents reserving those foods through the UI. A loaded or bot-controlled state can also reserve them without exposing a corresponding release control.

**Recommendation:** generate rules from the shared food list, show every reserved food even at zero stock, and link any food-rule concern directly to those controls. Use an explicit visual state and a short label such as `Eat` / `Reserve`. This is a correctness fix to do before cosmetic copy changes.

### 5. Building problems are hard to find and can be mislabeled

`src/ui/ui.ts:451–477` puts existing buildings after the blueprint catalog, locked research, paths, and decorations. Its compact building list maps every non-null `blockedReason` to `idle: no ingredients`. The underlying reason can instead be that every recipe is off, or that the research desk has nothing to study (`src/sim/world.ts:1483`). Low site efficiency is shown in the individual detail, but is absent from that overview. The map mainly labels buildings by name.

**Recommendation:** give existing workplaces a prominent management view with filters for unstaffed, blocked, inefficient, and under construction. Use specific states: `Recipes off`, `No grain`, `No workers`, `40% site`. Add a small warning badge on affected map buildings that opens the same detail. Keep construction materials and free-laborer actions close to stalled sites.

## Remaining surface inventory

| Surface | What works | Polish needed |
| --- | --- | --- |
| Resource HUD | Existing icons, quantities, storage capacity, spoil warning | Resource chips and spoil warning need destinations. Prioritize critical resources; preserve scroll position; offer touch-accessible names when labels are hidden. |
| Charter HUD | Visible goal and progress | Compound requirements are concatenated into a small text line. Show separate requirement icons/meters with links to relevant goods, people, or construction. |
| Research HUD | Already opens the desk | Add a compact progress/blocked indicator and the missing goods or staffing action. Focus the map consistently with other building navigation. |
| Strain/comfort | Explains the system and shows need bars; festival action exists | Several paragraphs repeat relationships between comfort and strain. Lead with rate and weakest needs; link each weak need to affected people/remedies. Put formulas and future expectations behind details. |
| Festival/feast | Forecasts attendance, food, drinks, and relief before committing | Lead with the forecast and timing. Collapse the formula. Emphasize shortage and the resulting benefit. Keep the commit button concise. |
| Build catalog | Building art, cost, footprint, explicit placement button | Group/filter by purpose. Distinguish available, research-locked, and blueprint-missing states. Show unmet costs visually beside each resource. Reduce repeated blurbs. |
| Placement/paths | Ghost footprint, valid/invalid colors, rotation icon, site efficiency, inline invalid reason | Add a distinct door marker, efficiency meter, and affected-area cue. Retain a short reason alongside color. Show material cost at confirmation. |
| Recipes | Input/output icons, stars, current recipe, toggle control | Give current/blocked/off states distinct symbols. Put unavailable inputs beside the recipe with a source link. Replace repeated operating instructions with optional help. |
| Storage | Presets, priority, per-item filters, quantities | Use a capacity bar and clear accepted/excluded states. Collapse the full item matrix until customization is needed; shorten hauling explanations. |
| Staffing | Inline assignment/removal and job-fit text | Make worker identity inspectable separately from the assignment action. Show relevant skill, fit, availability, and the laborer impact together. |
| Blueprint draft | Building art, costs, recipe stars, reachability and charter relevance | Consolidate repeated name/blurb/recipe copy. Mark unavailable routes visually. Give dependencies short badges and optional detail. |
| Research decision | Shows cost, unlocks, and study time | Shorten the introductory tutorial; foreground unlock icons and cost/time. |
| Recruit decision | Traits, skills, tastes, fee, beds/population | Too much comparison depends on prose. Lead with best skills, job fit, fee, and housing impact; expand trait and preference explanations. Avatars later. |
| Cornerstones | Clear choose-one cards and persistent effects | Keep a short effect summary; move the list of existing cornerstones out of the introductory paragraph. |
| Events | Narrative establishes character; choice consequences are visible | Preserve the humor in narrative, while making resource costs, risks, and effects compact and consistently placed. |
| Errands/caravan | Time remaining, assignee/progress, clickable assignment flow | Add progress bars and urgency symbols; keep assignment tradeoffs readable. |
| Trade | Item icons, prices, holdings, charter relevance | Show explicit buy/sell meaning and actual quantity/total proceeds. The sell buttons request 5/20 but the sim may clamp to stock/cap, so labels can overstate the sale. |
| Log | Timestamps and tone colors | Link referenced people/buildings where possible. Use event-type icons so tone is not color-only. |
| Resume/restart | Autosave state and destructive-action confirmation | Trim redundant button descriptions; retain the clear loss warning. |
| End screen | Clear outcome and numeric stats | Surface the actual collapse trigger and a few decisive causes. Current loss copy always says too many settlers were lost, although the simulation also supports a minimum-survivor trigger. |
| Toasts | Near the action and announced as status | Keep confirmations short. Actionable errors should remain near the relevant control and offer a destination; a brief toast should not carry essential guidance alone. |

## Interaction and accessibility

- Secondary controls such as festival, research, back, remove, and speed buttons are compact; use comfortable touch targets, especially for frequently used actions.
- Native `title` attributes carry explanations for resources, spoilage, seasons, and the loss threshold. Provide help that can be opened by touch and keyboard. Keep essential warnings visible without requiring a tooltip.
- Mood, relationships, resource-flow signs, and placement depend substantially on color. Keep numbers/signs and add recognizable state symbols or short labels.
- `renderHud` replaces its entire HTML when values change; `renderSheet` replaces the panel body. Preserve keyboard focus and relevant scroll positions across updates. The sheet preserves one scroll offset even across unrelated views; reset or restore it per view so a new screen starts predictably.
- Modal markup needs dialog semantics, focus placement/containment/restoration, and consistent keyboard dismissal for optional dialogs. Do not let explanatory overlays obscure the fact that simulation can continue: only queued decisions, resume, and game end block the simulation in `src/main.ts:51`.

Browser checks confirmed three continuity problems: a phone resource row scrolled 98px returned to 0 after a resource update; a focused speed button lost focus to the document body after a HUD update on both viewports; switching from a scrolled Build panel to Colonists opened the new list already 425px down on desktop and 461px down on phone. These are reproducible interaction defects, not just visual preferences.

## Copy direction

Use **state + quantity + action**. Preserve flavor in events, character names, and optional descriptions.

| Current pattern | Proposed treatment |
| --- | --- |
| `Anyone without a job builds, hauls and cleans.` repeated in the roster | Laborer icon + count; optional help on the role |
| `fill the empty woodcutter slots` in a static note | Warning icon, `Wood low · 4d`, `Staff woodcutter` button |
| Illness paragraph explaining clinic, doctor, and departure threshold | Illness icon + severity meter, `Untreated`, `Open clinic` or prerequisite action |
| `works at 40%` in a paragraph | Efficiency meter + `40%`, with the site requirement beside it |
| Long description of why people are unhappy | Top negative need + affected people + remedy; full thought ledger on expansion |
| Repeated recipe-toggle instructions | Consistent toggle state; optional `?` explanation |

Icons should replace repetition and familiar states, while uncommon icons retain a short label until players learn them. Tooltips should explain mechanics, never hide the only route to an essential action.

## Recommended implementation order

1. **Information correctness and continuity:** complete food controls, accurate building states and trade quantities, preserve focus/scroll, predictable navigation back to lists.
2. **Actionable problems:** shared issue destinations, foreman actions, affected-person links, ledger staffing links, warning badges on the HUD/map, and a way to inspect all concerns.
3. **Colonist and workplace hierarchy:** urgent needs/actions first, compact status rows, filters, expanded detail on demand, existing-building management above catalog browsing.
4. **Visual/copy pass:** consistent status icons, meters, costs, short action labels, concise decision cards, touch-friendly help and controls.
5. **Character avatars, after the above:** stable portraits derived from saved identity, with silhouette/hair/face/clothing differences. Reuse the same portrait in roster, detail, recruits, staffing, errands, and relationship links. Keep mood/illness/job badges separate from identity. Coordinate portraits with map characters so recognition carries across views.

The information work is mostly presentation and navigation: the simulation already exposes much of the required data. Avatars are a separate art and identity task, and should be scoped once their sizes and placements have settled.

## Validation and evidence

Reviewed all UI renderers, click actions, styling, map indicators, advisor concern/fix data, and economy summaries. Built the game successfully. Browser evidence is in `ui-audit/`: desktop (1440×900) and phone (390×844), initial state, bot-played days 4 and 9, all four tabs, colonist/building detail, strain, festival, placement, and representative recruit/blueprint decisions. Recruit/blueprint examples are injected preview states; bot-played states can include food reservations made by the bot. These are examples for inspection, not a human playtest or exhaustive coverage of every season, charter, event, and save history. Remaining decision types and conditional states were audited in source.

See `ui-audit/observations.json` for captured text and geometry, and the screenshots beside it. No gameplay changes, UI implementation, avatar assets, deployment, or publication were performed.

In the production-page phone sample, the Build panel contained 2,117px of content in a 439px viewport, and colonist detail contained 1,010px. The recruit preview fit vertically, and no horizontal overflow inside the sheet/modal or page errors were detected in the sampled states. This does not establish fit for every possible long name, event, or late-game state.

Representative evidence: [phone colonists](ui-audit/phone-colonists.png), [phone colonist detail](ui-audit/phone-colonist-detail.png), [desktop ledger](ui-audit/desktop-ledger.png), [phone recruit](ui-audit/phone-recruit.png), [phone placement](ui-audit/phone-placement.png).
