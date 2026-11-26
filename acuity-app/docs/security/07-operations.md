# 7. Operations, backup & downtime

## Monitoring

- `GET /api/health` returns `200 {"ok":true}` when the service can reach the
  database. It needs no sign-in, so the organization's monitoring can poll it.
- The service logs errors only, never record contents. Under Azure, logs flow to
  Application Insights or Log Analytics if the organization enables them.

## Backup & recovery

| Item | Approach |
|---|---|
| Database | The organization's standard policy. On Azure SQL: automated backups with point-in-time restore (default 7 days, configurable up to 35) and optional long-term retention. On-premises: the standard SQL Server or PostgreSQL backup jobs |
| Application | Rebuilt from the internal repository at any time (`npm ci && npm run build`); no state lives in the web tier |
| Configuration | `.env.production` (no secrets) in the internal repository; secrets in Azure application settings or the organization's secret store |
| Recovery check | After a restore, run `npm run check-db` and **Verify chain** in Settings → Audit log |

Recovery objectives follow the tier the organization assigns. The data is small
(well under 100 MB a year for a service line), so restores take minutes.

## Downtime procedure

Acuitas supports staffing decisions. It is not the record of care. Its
**Downtime kit** (Help & Training, and Settings for administrators) prints two
pages to keep on every unit:

- **Shift Acuity Worksheet.** One page per unit, with the same fields as New
  Shift Entry and that unit's cutoffs printed on it.
- **AcuiCalc™ zone card.** Shows the active calibration version, the
  GREEN/YELLOW/RED cutoffs for every zone set and the zone responses, plus a
  scoring sheet with the calibrated points so patients can be scored on paper.
  Reprint it whenever the calibration changes.

Neither page carries patient names, initials or MRNs. The scoring tally asks for
bed numbers only.

If Acuitas is unavailable:

1. Charge nurses record each shift on the paper worksheet.
2. The house supervisor makes staffing decisions using the printed cutoffs and
   zone responses.
3. When the system returns, the shifts are entered in New Shift Entry. Each is
   stamped with the active calibration and attributed in the audit log as usual.

Screens already open keep showing the last data they loaded and keep retrying in
the background. If a save does not reach the database, the person sees a "Not
saved" message, so they can re-enter it rather than assume it was kept.

## Change management

- Releases come from the internal repository through the organization's
  standard change process.
- Every release runs the full test suite and the database suite on SQL Server
  and PostgreSQL in CI.
- Schema scripts are safe to re-run, and no release changes the table structure
  without a documented migration.
- AcuiCalc™ calibration changes are governed in the app itself: Administrator
  only, with a written reason and reviewing nurses. Each one is versioned and
  audited, and historical scores are never re-scored.
