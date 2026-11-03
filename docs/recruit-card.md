# Recruit card: option A

Option A is now the default recruit card: portraits, three skill bars, wants with colony readiness, and tinted traits. Layouts B/C and the layout switch have been removed.

Want and trait chips open game-styled explanations on hover, keyboard focus or tap. Want help includes its requirement, whether the colony can support it, and the mood effects from the existing simulation rules. Green checks indicate colony support, not a guarantee that a newcomer's want is already met. Existing settlers' want chips use the same help styling.

Recruitment uses an explicit Invite button so opening help cannot choose a settler. Unaffordable recruits retain accessible explanations while their Invite button is disabled. Escape, moving away, an outside tap, scrolling, and hiding the trigger dismiss help. Tooltips stay within the viewport and allow the pointer to move into their text. Keyboard focus survives live redraws.

## Review the prototype

Run `npm run build && npm run prototype:recruit`, then open `dist/recruit-prototype/index.html`. This is the real bundled game with a preview fixture that opens the recruit decision immediately. It includes one supported want, unmet wants, positive/negative traits and an unaffordable recruit. The fixture lives only in the preview generator.

For browser checks, serve the repository on port 8765, then run `npm run test:ui:recruit`. Override `UI_URL` or `CHROMIUM_PATH` if needed. It checks desktop, phone and small-phone layouts; hover persistence; keyboard/touch; Escape; focus after redraw; all seven want descriptions; viewport bounds; unaffordable candidates; and invitation. Screenshots are written to `dist/recruit-prototype/`.

The regular game remains `dist/site/index.html` or the self-contained `dist/mumblewood.html`. No simulation rules changed.
