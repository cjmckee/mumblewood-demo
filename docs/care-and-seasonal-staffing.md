# Seasonal staffing and urgent care

## Current behavior

Two bot corrections are enabled by default:

- `BOT.seasonalStaffing`: buildings with zero current seasonal yield receive no planned workers. Actual reassignment releases those jobs, and positive-yield producers become eligible again when their season returns. Other productive jobs retain the existing allocation rules. Physical slots still count for expansion planning, so winter dormancy is not treated as a reason to duplicate a field.
- `BOT.urgentClinic`: an owned, affordable first clinic can precede a charter's missing production chain when settlers are bedridden. It uses the next available construction slot without canceling projects. A doctor gets priority over research while food emergencies and an almost-empty fuel pile retain precedence. Clinic staff must be completely healthy, matching the simulation's treatment rule. During an active medical need, the bot reserves a healthy medic before filling ordinary jobs, preferring medicine skill. Mildly ill settlers can still perform compatible ordinary work.

This does not grant blueprints, materials, workers, treatment capacity or stronger medicine. The regular discretionary ten-wood construction buffer is retained. Manual worker assignments remain available. Clinic admissions were subsequently updated to [critical priority and a first-come noncritical queue](clinic-admissions.md).

## Confirmed winter staffing problem

The soil-equipped seed 8919 is given only the field, mill and bakery blueprints; buildings and production are earned normally. Both paired runs follow identical history to hour 480 (winter starts). The candidate enables seasonal staffing only.

| Observation | Old staffing | Seasonal staffing |
| --- | ---: | ---: |
| First completed field | Day 25.62 | Day 25.62 |
| Field-assigned winter worker-hours | 78 | 0 |
| Bakery-assigned winter worker-hours | 60 | 75 |
| Charter 2 completion | Day 32.67 | Day 32.54 |
| Victory | Day 42.75 | Day 49.42 |
| Deaths / departures | 0 / 0 | 0 / 0 |

The old plan assigns workers to a newly completed field during winter even though its output multiplier is zero. The new plan never allocates them there. These are assignment-hour observations, not productive labor totals. The different final charter selections and subsequent events mean the later victory cannot be interpreted as a direct cost of releasing farmers. The local correction is not wasting worker assignments on zero output.

Focused checks also exercise actual `autoStaff` release from a winter field and reassignment in spring, rather than only checking a calculated staffing map. The eligibility filter applies equally to zero-yield orchards, apiaries and flax fields, although this paired replay exercises a grain field.

## Urgent clinic: actions matter beyond a building's existence

The second case uses seed 8919 with only the cellar blueprint granted, reproducing the prior outbreak. Interventions begin at hour 144 (day 7), from the same world and decision RNG.

| Policy | First clinic completed | Deaths | Departures | Victory |
| --- | ---: | ---: | ---: | ---: |
| Old priorities | Day 12.50 | 3 | 0 | Day 45.33 |
| Earlier clinic/doctor priority, before healthy-staff correction | Day 11.63 | 3 | 0 | Day 51.29 |
| Temporary two-wood buffer experiment | Day 11.50 | 3 | 0 | Day 42.71 |
| Clinic priority plus healthy medic | Day 11.63 | 2 | 0 | Day 52.54 |

These are successive diagnostic continuations of one state, not independent samples or a ranking by victory time. Reduced losses alter population, recruitment and later decisions. The low-buffer prototype did not solve the outbreak and is not enabled. It also depleted the wood pile during the early crisis; the normal buffer remains ten.

The clinic initially remains unaffordable: wood is only about eight units at day 7 and stays scarce while already-started dining/housing work completes. Prioritizing the clinic advances it, but cannot create materials or make a finished building instantly available.

A second issue appears once the clinic is staffed. The old assignment retained Delphine Pennywhistle, a skilled but mildly ill worker. The simulation explicitly excludes **any ill doctor** from treatment, even when that illness is mild enough to allow ordinary work. Thus an occupied doctor slot did not imply that patients received care. The correction assigns healthy Mortimer Thistledown instead, allowing actual treatment and preventing one of the three previously observed deaths in the matched continuation.

## Remaining clinic-bed decision

A close replay records full states around hours 252–288:

- At hour 258, Hester Bunt and Osric Tumble occupy the two clinic beds. Hester has critical flu at severity 92.3; Osric has a recoverable ankle injury at 9.6.
- Mirabel Underhill and Cuthbert Quigley wait at home with flu severity 96.2.
- Healthy Mortimer is working at the clinic, medicine skill about 5.2.
- By hour 264, Mirabel reaches a bed at severity 99.8, but the doctor is sleeping. Cuthbert dies at hour 264 and Mirabel at 265.

This is a capacity/bed-allocation and timing problem, not proof that the healthy-doctor correction failed to provide treatment. Existing arrival/occupancy behavior gives a bed to a recoverable injury while life-threatening cases wait. The user chose critical priority with first-come service for noncritical cases. This is now implemented, preserving displaced patients' queue positions; see [clinic admissions](clinic-admissions.md). Overnight doctor hours remain unchanged. The observations in this section describe the old bed allocation.

## Ordinary contrasting cases

Enabling both corrections from the first bot action, without blueprint grants:

| Seed | Previous victory | New victory | Deaths / departures |
| --- | ---: | ---: | --- |
| 1000 | Day 31.75 | Day 32.75 | 0 / 0 |
| 24757 | Day 47.33 | Day 46.75 | 0 / 0 |

These same familiar cases remain loss-free; completion times move both ways. The reason to enable the fixes is coherent behavior and the explicit treatment/staffing rules, not a claim that they always improve speed or establish a general win rate.

## Reproduction and checks

Historical comparisons need the explicit pre-fix care/staffing strategy:

```sh
CLINIC_TRIAGE=legacy CARE_STAFFING=legacy EXTRA_BLUEPRINTS=cellar FORK_HOUR=144 FORK_POLICY=control WATCH=1 SEEDS=8919 RESULT_DIR=dist/care/control npx tsx tools/combined-seasons.ts taper 1 90
CLINIC_TRIAGE=legacy CARE_STAFFING=legacy EXTRA_BLUEPRINTS=cellar FORK_HOUR=144 FORK_POLICY=urgent-care WATCH=1 SEEDS=8919 RESULT_DIR=dist/care/healthy-doctor npx tsx tools/combined-seasons.ts taper 1 90
CLINIC_TRIAGE=legacy CARE_STAFFING=legacy EXTRA_BLUEPRINTS=field,mill,bakery FORK_HOUR=480 FORK_POLICY=control WATCH=1 SEEDS=8919 RESULT_DIR=dist/care/season-control npx tsx tools/combined-seasons.ts taper 1 90
CLINIC_TRIAGE=legacy CARE_STAFFING=legacy EXTRA_BLUEPRINTS=field,mill,bakery FORK_HOUR=480 FORK_POLICY=seasonal-staffing WATCH=1 SEEDS=8919 RESULT_DIR=dist/care/season npx tsx tools/combined-seasons.ts taper 1 90
```

`FORK_POLICY=care-and-seasons` enables both at a chosen checkpoint. `STATE_HOURS=252,258,264,270,288` writes full observation states for the clinic close-up. `urgent-care-buffer` retains the discarded two-wood-buffer experiment only for diagnostic replay. Early intermediate clinic-priority results predate the healthy-doctor correction; use their archived traces rather than expecting that intermediate behavior from current code.

Paired worlds, decision RNG and pre-intervention settings were checked for equality; the earlier control settings omit the subsequently introduced `clinicWoodBuffer` field, equivalent to its default ten. `tools/care-seasons-check.ts` covers urgent construction, actual costs and blueprint access, unchanged healthy-colony priorities, dormant-field release/spring return, removal of a mildly ill doctor and reservation of a healthy medic already employed elsewhere.

TypeScript, build, rough-plank, fine-material planning, meal reservations, tavern servings, construction reservation and workshop-buffer/control/save checks pass. Artifacts and close-up states are in `/workspace/research-audit/care-seasons/`.
