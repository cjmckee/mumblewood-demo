# Clinic admissions and patient queues

## Current rule

Clinics automatically prioritize illnesses that can be fatal in the simulation. A critical patient can displace a noncritical patient. Among critical patients waiting for a bed, higher severity goes first; existing critical treatment continues so small severity changes do not send patients repeatedly between home and clinic.

Non-life-threatening cases are first come, first served. Becoming bedridden records a request time, even before a clinic is available. Noncritical severity does not jump the queue. A displaced noncritical patient retains the original request time and can return ahead of later requests. Requests end when the settler no longer needs bedrest. Expanding the number of clinics remains the player's way to provide more treatment capacity.

In the current illness engine, contagious illnesses can cause death at severity 100, while other illnesses send settlers to a city physician. Admissions use that existing distinction; no new lethality threshold, disease rate, bed count or medicine bonus was introduced.

Reservations include patients travelling to a clinic, not just those already inside. All patients share one deterministic allocation per movement tick, preventing multiple arrivals from claiming the same bed. Existing destinations are favored when capacity permits. The clinic panel explains triage, lists admitted/arriving patients and shows the colony's waiting patients. Illness cards now correctly distinguish potentially fatal illness from conditions that lead to a city physician.

## Queue persistence and compatibility

`Colonist.clinicRequestedAt` is optional saved data. It survives normal JSON save/resume and is retained during displacement. Existing saves initialize missing request times on their next tick, preserving existing admissions on equal/unknown request order. Healing out of bedrest clears the request; a newly acquired illness starts a new one. No save-version reset or resource migration is required.

`START.clinicTriage` defaults to true. `CLINIC_TRIAGE=legacy` in the diagnostic runner reproduces the old occupancy policy; this is a comparison option, not a player-facing toggle.

## Watched outbreak

The existing cellar-access seed 8919 is replayed under legacy care priorities until day 7, then enables urgent clinic/healthy-doctor behavior. Both final continuations match byte-for-byte at hour 252, just before the clinic completes. One keeps old bed allocation; one enables the final triage/queue rule.

At hour 258:

- Old allocation treats Hester's critical flu and Osric's recoverable ankle injury, while two other flu patients wait at home.
- Triage treats Hester and Mirabel's flu. Osric yields the bed and retains his earlier request time. Cuthbert waits because both beds are occupied by critical patients.

By day 14, the control has two flu deaths and the triage continuation has one. Neither has a departure. The short replay intentionally stops then; it is not a win-rate or whole-run pacing comparison. Existing capacity and doctor hours still limit care, especially overnight. No outcome is presented as guaranteed rescue of every patient.

An earlier prototype continuously re-sorted every patient by severity. That caused repeated movement as treated patients improved and queued patients worsened, and all three flu patients eventually died in that diagnostic continuation. It was replaced by continuity for critical treatment. The user then specified first-come service for noncritical patients, which the final rule implements and tests explicitly.

Before the final noncritical queue refinement, full default-rule replays still won without losses for familiar seeds 1000 and 24757 (days 32.75 and 46.75); the labeled cellar-access case won on day 58.75 with one death. Those are historical full-run observations of the immediately preceding triage version, not new validation of every later queue outcome.

## Validation

`tools/clinic-triage-check.ts` covers:

- Critical illness displacing an admitted noncritical injury.
- Severity ordering for waiting critical patients and continuity for those receiving care.
- Noncritical first-come service even when a later arrival has greater severity.
- Preserved queue position after displacement and readmission.
- Bed limits across multiple clinics, including incoming reservations.
- Actual movement out of a displaced bed and into prioritized care.
- Initialization of missing queue data and actual save/resume preservation.

TypeScript, build, care/seasonal staffing, recipes, production routes, clothing/calendar/save, bedside meals and workshop-buffer/control/save checks pass. A browser check loads the saved outbreak at phone width and verifies the triage explanation, waiting list and fatal-illness warning without page errors.

## Reproduction

Run the two final short continuations in separate processes:

```sh
CARE_STAFFING=legacy CLINIC_TRIAGE=legacy EXTRA_BLUEPRINTS=cellar FORK_HOUR=144 FORK_POLICY=urgent-care TRIAGE_HOUR=252 TRIAGE_POLICY=control STATE_HOURS=258,264,270,288 WATCH=1 SEEDS=8919 RESULT_DIR=dist/clinic/control npx tsx tools/combined-seasons.ts taper 1 13
CARE_STAFFING=legacy CLINIC_TRIAGE=legacy EXTRA_BLUEPRINTS=cellar FORK_HOUR=144 FORK_POLICY=urgent-care TRIAGE_HOUR=252 TRIAGE_POLICY=triage STATE_HOURS=258,264,270,288 WATCH=1 SEEDS=8919 RESULT_DIR=dist/clinic/triage npx tsx tools/combined-seasons.ts taper 1 13
```

Artifacts: `/workspace/research-audit/care-seasons/final-triage-{control,triage}/`. Earlier experimental continuations remain separately labeled in the same parent directory. The clinic screenshot is `clinic-triage-phone.png`.
