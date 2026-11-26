# AcuiCalc™ zone cutoff standard

How the GREEN / YELLOW / RED cutoffs are set, tested and changed. One construct,
one method, every setting. Only the unit of the score differs between settings.

## 1. One construct

Every zone answers the same question: **is the acuity workload per caregiver
on this shift manageable, strained or unsafe?**

| Setting | Score | Why |
|---|---|---|
| Inpatient unit | AcuiCalc™ points ÷ (staff on shift − patients on 1:1), never less than 1 | Staffing is logged each shift, so workload per caregiver is measured directly. A 1:1 takes one staff member entirely, so that person is not counted as sharing the rest of the unit |
| Emergency department | Total AcuiCalc™ points | The ED score is not divided by staff, so its cutoffs carry the staffing inside them |
| Pediatric ED | Total points, including pediatric modifiers | As the ED |

**Routine observation is not scored.** Observation that every patient on a
unit receives (for example, routine Q15 checks) is the unit's baseline, not
acuity. AcuiCalc™ scores only observation above the unit's routine level.

These two rules are AcuiCalc™ instrument 2. Every saved shift records the
instrument version it was scored under. Shifts saved earlier are instrument 1
and are never re-scored.

## 2. Starting points

Starting points come from the per-staff standard. They hold until local
evidence (section 3) confirms or adjusts them.

| Setting | GREEN | YELLOW | RED | Derivation |
|---|---|---|---|---|
| Inpatient | ≤ 1.5 | ≤ 2.5 | > 2.5 | The per-staff standard |
| ED | ≤ 24 | ≤ 40 | > 40 | 1.5 × 16 and 2.5 × 16, where 16 is the number of staff who typically care for behavioral health patients in the ED on a shift (RNs, techs and sitters combined) |
| Pediatric ED | ≤ 53 | ≤ 71 | > 71 | Carried over from the earlier pilot: 20% above the original 45 / 60 bands. **Not yet derived by this standard** (see below) |

- **The ED formula.** ED cutoffs = per-staff cutoffs × the typical number of
  behavioral health staff per shift. A system whose EDs run different staffing
  substitutes its own number, through a governed calibration (section 5):
  GREEN = 1.5 × S and YELLOW = 2.5 × S.
- **Several EDs.** Calibration is system-wide. If the system's EDs differ a lot
  in behavioral health staffing, one total-points cutoff cannot fit all of them.
  The fix is to record behavioral health staff on ED entries and divide, as
  inpatient units do; that is a future option. Until then, use the system's
  typical ED.
- **Band shape.** The per-staff standard puts YELLOW's upper cutoff at 5/3 of
  GREEN's in every setting: 1.5 → 2.5 and 24 → 40.
- **Pediatric ED.** Its bands (53 / 71, a ratio of 1.34) came from a different
  route. It should be re-derived the same way once its typical behavioral
  health staffing is known, allowing for the higher totals that pediatric
  modifiers add, and then confirmed by evidence.

### Reference unit check (face validity)

Before any cutoff is used, the staffing committee checks it against a real
unit that nurses know well. The reference is a typical adult unit: average
census 18, normally staffed with 4–5, so 3.6–4.5 patients per staff member
before any acuity is counted.

Acuity per staff = points ÷ (staff on shift − patients on 1:1).

| Shift on the reference unit | Points | 1:1s | 4 staff | 5 staff |
|---|---|---|---|---|
| Two patients on detox | 4 | 0 | GREEN (1.0) | GREEN (0.8) |
| One 1:1 | 5 | 1 | YELLOW (1.67) | GREEN (1.25) |
| One 1:1 + one restraint | 9 | 1 | RED (3.0) | YELLOW (2.25) |
| Two 1:1s | 10 | 2 | RED (5.0) | RED (3.33) |
| Two 1:1s + an aggression | 14 | 2 | RED (7.0) | RED (4.67) |
| Routine Q15 for every patient (not scored) | 0 | 0 | GREEN | GREEN |

These results come from the instrument 2 rules (section 1), adopted after
this check found two problems in the original scoring:

- Two 1:1s on 4 staff, which leaves 2 people for 16 patients, read only YELLOW.
- Routine Q15 checks put the unit in RED every shift.

Census is still not part of the zone. The zone moves with acuity and staff,
not with headcount: 22 patients score the same as 18 if the points and staff
are the same. Headcount is tracked separately against the unit's nursing
census cap.

## 3. Evidence: the contrasting-groups method

A starting point is a hypothesis. Local evidence decides whether to keep it.

1. **Independent anchor.** On every shift entry, the charge nurse rates the
   shift **Manageable**, **Strained** or **Unsafe** in their own judgment,
   before Acuitas shows its zone. The rating never changes that shift's zone
   or any cutoff. Zones are fixed system-wide; ratings are only evidence for
   the scheduled reviews below.
2. **Two boundaries.**
   - GREEN / YELLOW separates Manageable from Strained or Unsafe.
   - YELLOW / RED separates Manageable or Strained from Unsafe.
3. **Estimate.** For each boundary, the supported cutoff is the score that
   misclassifies the fewest rated shifts. At that score, a shift is as likely to
   be rated on one side as the other. This is the contrasting-groups method of
   standard setting.
   - Youden's J is reported but not used to choose the cutoff, because with
     groups of unequal size it pulls the cutoff toward the smaller group.
4. **Uncertainty.** A 95% bootstrap confidence interval: 400 resamples, seeded,
   so the same data always gives the same interval.
5. **Separation.** The AUC shows whether the score separates the groups at all.
6. **Agreement.** The linearly weighted kappa between the zone shown and the
   nurse's rating, read on the Landis and Koch bands.

Acuitas computes all of this per zone set, under **Outcomes & ROI → Cutoff
evidence** and in Settings. Nothing there changes a cutoff by itself.

### Decision rules

| Condition | Action |
|---|---|
| Fewer than 30 rated shifts, or fewer than 5 on either side of a boundary | No estimate. Keep the starting point |
| Fewer than 100 rated shifts, or fewer than 20 on either side | Estimate shown, but treated as early. No change |
| AUC below 0.70 for a boundary | Do not move the cutoff. The score is not separating the groups, so the problem is scoring reliability or the instrument, not the cutoff. Check inter-rater reliability first |
| Cutoff in use inside the 95% interval | Keep it. The evidence supports it |
| Cutoff in use outside the 95% interval at **two consecutive** reviews, with the rules above met | Bring a change to the staffing committee: move to the supported value, rounded to the scale's step (0.1 per staff; 1 ED point) |

## 4. Prerequisites and checks

- **Reliability first.** Inter-rater reliability of the AcuiCalc™ total score
  (ICC(2,1)) is 0.75 or higher before cutoffs are tuned. Tuning cutoffs to an
  unreliable score fits noise.
- **Criterion check.** Safety events per unit-shift rise from GREEN to YELLOW
  to RED, and the RED-to-GREEN relative risk has a 95% interval above 1
  (Outcomes & ROI → Safety events by acuity stage). A proposed change must not
  break this ordering.
- **Fixed analysis periods.** Cutoffs do not change inside an analysis period,
  such as the first 45 days of a pilot. Each saved shift keeps the calibration
  version it was scored under, so periods can be compared.

## 5. Governance

- **Who.** Only an Administrator can change cutoffs. The data service enforces
  this on the server for every request, not just on the screen.
- **What a change must carry.** Every change needs:
  - a written reason;
  - the names or roles of the reviewing frontline nurses;
  - in the reason, the evidence: rated shifts, supported cutoff, its 95%
    interval, AUC and kappa.

  The service refuses a change without a reason or reviewers. Including the
  evidence in the reason is policy, checked at the staffing committee.
- **Versioning.** Each change is a new numbered version, written to the
  hash-chained audit log with the old and new values. Earlier versions can never
  be edited, and saved shifts are never re-scored.
- **Unit assignment.** Which zone set a unit reads (ED or pediatric ED), and its
  type, are also audited, unit by unit, with before and after values.
- **Cadence.**
  - Pilot: reviews at day 45 and day 90.
  - Afterwards: quarterly, at most one change per quarter, through the staffing
    committee.

### Not allowed

- Setting cutoffs from percentiles alone (for example, "RED = the top 10% of
  shifts"). That fixes how often RED appears regardless of real risk.
- Moving cutoffs to meet a target, such as fewer RED shifts on a dashboard.
- Changing cutoffs during an analysis period.

## References

- Livingston SA, Zieky MJ. *Passing Scores: A Manual for Setting Standards of
  Performance on Educational and Occupational Tests.* Educational Testing
  Service; 1982. (Contrasting-groups method.)
- Youden WJ. Index for rating diagnostic tests. *Cancer.* 1950;3(1):32–35.
- Landis JR, Koch GG. The measurement of observer agreement for categorical
  data. *Biometrics.* 1977;33(1):159–174.
- Koo TK, Li MY. A guideline of selecting and reporting intraclass correlation
  coefficients for reliability research. *J Chiropr Med.* 2016;15(2):155–163.
- Efron B, Tibshirani RJ. *An Introduction to the Bootstrap.* Chapman & Hall;
  1993.
