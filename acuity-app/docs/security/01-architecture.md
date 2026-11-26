# 1. Architecture & data flow

## Components

| Component | What it is | Runs on |
|---|---|---|
| Web app | A static single-page application: HTML, JavaScript and CSS, with React 18. All forecasting and scoring run in the browser | Azure Static Web Apps, or any web server |
| Data service | A small Node.js 20 web API (`api/`) holding the access rules, audit enforcement and database access | The Static Web App's managed API (Azure Functions), a Function App, or a Node.js server on-premises |
| Database | Two tables and a sequence (`api/sql/`) | Microsoft SQL Server 2016+, Azure SQL Database, or PostgreSQL 12+ |
| Sign-in | Microsoft Entra ID through Static Web Apps authentication, or the organization's identity-aware proxy | The organization's identity platform |

## Data flow

```
 ┌──────────────┐  1. HTTPS: page + scripts (same site)   ┌────────────────────────────┐
 │   Browser    │ ───────────────────────────────────────▶│  Azure Static Web Apps     │
 │  (Acuitas)   │                                          │  or organization web server│
 │              │  2. Sign-in redirect                     │                            │
 │              │ ◀──────────────────────▶ Microsoft Entra ID (groups → Acuitas role)   │
 │              │                                          │                            │
 │              │  3. HTTPS /api/* (session cookie)        │  ┌──────────────────────┐  │
 │              │ ───────────────────────────────────────▶ │  │ Acuitas data service │  │
 └──────────────┘                                          │  │ • identity from SSO  │  │
                                                           │  │ • role check per call│  │
                                                           │  │ • audit sequencing   │  │
                                                           │  └──────────┬───────────┘  │
                                                           └─────────────┼──────────────┘
                                                                         │ 4. TLS, least-privilege login
                                                                         ▼
                                                           ┌────────────────────────────┐
                                                           │ SQL Server / Azure SQL /   │
                                                           │ PostgreSQL (org-managed)   │
                                                           │ • audit append-only trigger│
                                                           └────────────────────────────┘
```

1. The browser loads the app from the organization's site. The app loads
   nothing from any other host: no CDN, font service, analytics or Google
   service. The Content Security Policy allows only the same site.
2. The sign-in layer authenticates the user with Entra ID before any page or API
   request is served. At sign-in, Static Web Apps asks the data service
   (`/api/GetRoles`) to translate the user's directory groups into one Acuitas
   role.
3. The browser calls the data service on the same site. It sends no tokens of its
   own: the sign-in layer attaches the verified identity, and the data service
   reads it from a header that clients cannot set.
4. The data service reaches the database over TLS with a login that can only
   read and write the Acuitas tables.

## Trust boundaries

| Boundary | Control |
|---|---|
| Internet / intranet → site | TLS; sign-in required for every route (`staticwebapp.config.json` routes; or the proxy) |
| Browser → data service | Identity comes only from the sign-in layer; role checked on every call; request size limited to 5 MB; record ids validated |
| Data service → database | Parameterized SQL only (no string-built queries); least-privilege login; TLS |
| Database administrators | Audit trigger refuses UPDATE/DELETE of audit rows; the hash chain detects any change made by other means |

## Live updates

Each open screen asks the service every 4 seconds which collections have
changed, in one small request, and reloads only those. A save reloads its
collection at once. Change numbers are issued in commit order, so a screen never
misses an update, and a full refresh runs every minute as a safety net. The
browser holds no open sockets and needs no WebSocket support.

## Build variants

The same source builds three variants. Each contains only the code it uses.

| Build | Setting | Data | Contains |
|---|---|---|---|
| Demonstration | none | Each browser's local storage | No network calls at all |
| **Service line** | `VITE_BACKEND=api` | Organization database via the data service | No Firebase or Google code (verified at build time) |
| Reference | `VITE_FIREBASE_CONFIG` | Google Cloud Firestore | Not for use where Google Cloud is not permitted |

## Open items

- Confirm with the Azure team whether the database will be reached with a SQL
  login, or with managed identity through a linked Function App (see
  `api/README.md`).
