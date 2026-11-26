# Acuitas data service

The shared-database path for Acuitas. It is a small web API that stores Acuitas
data in the organization's own database (**Microsoft SQL Server, Azure SQL
Database or PostgreSQL**) and checks the signed-in user's role on every read and
write. No Google service is involved anywhere.

```
 Browser (Acuitas)  ──HTTPS──▶  Sign-in layer  ──▶  Acuitas data service  ──▶  Your database
   no credentials,               Entra ID via         role checks on            SQL Server /
   same-site /api calls          Static Web Apps,     every call; audit         Azure SQL /
                                 or a sign-in proxy   log append-only           PostgreSQL
```

- The demonstration build is unaffected. Nothing here runs unless a build sets
  `VITE_BACKEND=api`.
- All data lives in two tables. `acuitas_records` holds one JSON row per record,
  and `acuitas_versions` holds one change number per collection. These are the
  same collections and fields the app has always used.
- Access rules are a direct port of `firestore.rules`, and the service enforces
  them on the server (`src/core/rules.js`).
- The audit log is append-only in three places: in the service, in a database
  trigger, and through least-privilege grants. It is also kept as one strict
  hash-chained sequence.
- Other people's changes appear within about 4 seconds. Your own appear at once.

---

## 1. Set up the database (once)

1. Create an empty database, for example `acuitas`.
2. Run the schema script as a database owner:
   - SQL Server or Azure SQL: `sql/sqlserver.sql`, in SSMS, Azure Data Studio or `sqlcmd`.
   - PostgreSQL: `sql/postgres.sql`, with `psql -f`.
3. Create a login for the service with only these rights:
   - SQL Server: `SELECT, INSERT, UPDATE, DELETE` on `dbo.acuitas_records` and
     `dbo.acuitas_versions`, plus `UPDATE` on `dbo.acuitas_seq`. Grant no DDL
     rights, so the service cannot disable the audit trigger.
   - PostgreSQL: `SELECT, INSERT, UPDATE, DELETE` on both tables, plus `USAGE` on
     `acuitas_seq`. Do not grant `TRUNCATE`.
4. Confirm the database is ready from any machine with Node.js 20+:
   ```
   cd api && npm ci
   ACUITAS_DB=sqlserver ACUITAS_DB_CONNECTION="Server=...;Database=acuitas;User Id=...;Password=...;Encrypt=true" npm run check-db
   ```
   The check prints `The Acuitas database is ready.` when the connection, the
   tables and the audit trigger are all in place.

Data volume is small. A 10-unit service line produces well under 100 MB a year.
Use the organization's standard backup policy for the database.

## 2a. Host on Azure Static Web Apps with Microsoft Entra ID (recommended)

This option keeps the app, the API and sign-in in one Azure resource. It needs
the **Standard** plan, which is required for Entra ID with group-based roles.

**Microsoft Entra ID (app registration)**
1. Register an application. Set the redirect URI to
   `https://<your-host>/.auth/login/aad/callback`.
2. Under **Token configuration**, add a **groups** claim, sent as group object
   IDs. Alternatively, define **app roles** and assign people to them.
3. Create a client secret.

**Repository settings**
1. In `staticwebapp.config.json`, replace `<TENANT_ID>` with your tenant ID.
2. Create `.env.production` from `.env.example` with:
   ```
   ACUITAS_BASE=/
   ACUITAS_OUT_DIR=dist
   VITE_BACKEND=api
   VITE_AUTH_MODE=gateway
   VITE_IDENTITY_ENDPOINT=/.auth/me
   VITE_SIGN_IN_URL=/.auth/login/aad
   ```
   Commit it to your internal repository only. It contains no secrets.
3. Use these Static Web App build settings: app location `/`, API location
   `api`, output location `dist`.

**Static Web App application settings**

| Setting | Value |
|---|---|
| `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | From the app registration |
| `ACUITAS_AUTH` | `swa` |
| `ACUITAS_DB` | `sqlserver` (or `postgres`) |
| `ACUITAS_DB_CONNECTION` | Connection string for the service login from step 1 |
| `ACUITAS_ROLE_MAP` | Your groups mapped to Acuitas roles, e.g. `{"<group-object-id>":"admin","<group-object-id>":"supervisor","<group-object-id>":"charge"}` |

How sign-in works:
- Everyone signs in with their hospital account; anyone not signed in is
  redirected to Entra ID.
- At sign-in, Static Web Apps calls `/api/GetRoles`, which turns the user's
  groups into an Acuitas role.
- A signed-in user who is in none of the mapped groups gets **viewer**, never
  more.
- Leave `VITE_ROLE_MAP` blank in this option.

Security headers, including a Content Security Policy that allows nothing
outside the site, come from `staticwebapp.config.json`.

> **Managed identity.** To connect to Azure SQL without a password, run the API
> as a standalone Azure Function App linked to the Static Web App, rather than
> as the built-in managed API. Then set
> `ACUITAS_DB_CONFIG={"server":"<name>.database.windows.net","database":"acuitas","authentication":{"type":"azure-active-directory-default"},"options":{"encrypt":true}}`.
> Confirm with your Azure team which of these your tenant allows.

## 2b. Host on your own server behind a sign-in proxy

Run the service as a Node.js 20+ web server. It serves both the app and the API
from one site, so the browser makes no cross-site requests. Put it behind the
organization's identity-aware proxy, for example oauth2-proxy with Entra ID, or
IIS or NGINX with your SSO module.

```
npm ci && npm run build              # in the app folder, with the .env.production above
cd api && npm ci
ACUITAS_AUTH=proxy \
ACUITAS_PROXY_USER_HEADER=x-forwarded-email \
ACUITAS_PROXY_GROUPS_HEADER=x-forwarded-groups \
ACUITAS_PROXY_SECRET=<long random value the proxy adds as x-acuitas-proxy-secret> \
ACUITAS_ROLE_MAP='{"BH-House-Supervisors":"supervisor","BH-Charge-RNs":"charge"}' \
ACUITAS_DB=sqlserver ACUITAS_DB_CONNECTION="..." \
ACUITAS_STATIC_DIR=../dist NODE_ENV=production PORT=8080 npm start
```

- Firewall the service so only the proxy can reach it. The proxy must
  overwrite, never pass through, the identity headers a browser might send.
- Build the app with the same `VITE_ROLE_MAP` as `ACUITAS_ROLE_MAP`.
- Set `VITE_IDENTITY_ENDPOINT` to the proxy's user-info endpoint.

## 3. Try it locally

```
# App: build for the data service, with the development sign-in page
VITE_BACKEND=api VITE_AUTH_MODE=gateway VITE_IDENTITY_ENDPOINT=/.auth/me \
VITE_SIGN_IN_URL=/.auth/login/dev ACUITAS_BASE=/ ACUITAS_OUT_DIR=dist npm run build

# Service: in-memory store (or ACUITAS_DB=postgres|sqlserver with ACUITAS_DB_AUTO_SCHEMA=1)
cd api && npm ci
ACUITAS_AUTH=dev ACUITAS_STATIC_DIR=../dist PORT=8080 npm start
```

Then open
`http://localhost:8080/.auth/login/dev?user=you@example.org&role=admin`.
Use a second browser, with a different user and `role=charge`, to watch
changes move between them.

The development sign-in has two limits:
- It is refused whenever `NODE_ENV=production`.
- It has no effect under `swa` or `proxy`.

## 4. Tests

The app's test suite (`npm test` in the app folder) runs the service's behavior
suite against the in-memory store. To run the same suite against real databases,
point it at **empty** test databases. The audit log can never be cleared, so
use a fresh database each run.

```
ACUITAS_TEST_PG="postgresql://user@host:5432/acuitas_test" \
ACUITAS_TEST_MSSQL="Server=host,1433;Database=acuitas_test;User Id=...;Password=...;Encrypt=true;TrustServerCertificate=true" \
npm test
```

## 5. Operations

- **Health:** `GET /api/health` answers `{"ok":true}` when the service can reach
  the database. It needs no sign-in, so a load balancer or monitor can call it.
- **Load:** each open screen makes one small request every 4 seconds, and every
  16 seconds when the tab is in the background. Fifty open screens come to
  about 750 requests a minute, almost all of them "nothing changed".
- **Logs:** the service logs errors only. It never logs record contents.
- **Upgrades:** the schema scripts are safe to re-run.

## API reference

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness (no sign-in) |
| GET | `/api/me` | The caller and role as the service sees them |
| GET | `/api/changes?since=N` | Collections changed after change number N |
| GET | `/api/data/{collection}` | Every record in a collection the caller may read |
| GET | `/api/data/{collection}/{id}` | One record |
| PUT | `/api/data/{collection}/{id}` | Create or replace (`{ data, merge }`) |
| PATCH | `/api/data/{collection}/{id}` | Update fields and add to numbers atomically (`{ set, increment }`) |
| DELETE | `/api/data/{collection}/{id}` | Remove (where the role allows) |
| POST | `/api/data/{collection}/_replace` | Replace a whole collection in one transaction (`{ items }`) |
| POST | `/api/GetRoles` | Static Web Apps role assignment at sign-in |
