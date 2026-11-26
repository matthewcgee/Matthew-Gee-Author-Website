# 5. Vulnerability management & software bill of materials

## What ships

| Part | Runtime dependencies |
|---|---|
| Web app (in the browser) | React 18.3, React DOM 18.3, Recharts 2.15, and the Inter, Nunito and Playfair Display typefaces (Fontsource packages, SIL Open Font License), all bundled into the site |
| Data service | `@azure/functions` (Azure Functions host binding), `mssql` (SQL Server / Azure SQL driver), `pg` (PostgreSQL driver), and their dependencies |

The service-line build contains no Firebase or Google code. The Firebase library
is not even installed by default. It is needed only to build the Firestore
reference option.

## Dependency scan (npm audit, 26 November 2026)

| Scope | Critical | High | Moderate | Low |
|---|---|---|---|---|
| Web app, shipped dependencies | 0 | 0 | 0 | 0 |
| Data service, shipped dependencies | 0 | 0 | 0 | 0 |
| Web app, build and test tools (not shipped) | 2 | 1 | 3 | 0 |

The six build-tool findings are all in the development toolchain: Vite 5's
development server, and the Vitest 2 test runner with its helpers (tinypool,
@vitest/mocker, vite-node). They affect a developer's machine while the dev
server or test UI is running. They are not part of the built site, and the
Content Security Policy and hosting do not expose them.

- Fixing them needs major-version upgrades of Vite and Vitest. These are
  scheduled as a maintenance item, with the full test suite and build
  verification, rather than applied without testing.
- Until then, run the development server only on a developer workstation, never
  on a shared or reachable host. That is already the documented practice.

## Software bill of materials

CycloneDX 1.5 JSON, generated with `npm sbom`, shipped dependencies only:

- [`sbom/acuitas-web.cdx.json`](sbom/acuitas-web.cdx.json): web app, 46 components
- [`sbom/acuitas-data-service.cdx.json`](sbom/acuitas-data-service.cdx.json): data service, 93 components

Regenerate after any dependency change:

```
npm sbom --sbom-format cyclonedx --omit dev > docs/security/sbom/acuitas-web.cdx.json
cd api && npm sbom --sbom-format cyclonedx --omit dev > ../docs/security/sbom/acuitas-data-service.cdx.json
```

## Ongoing process

- `npm audit --omit=dev` in both folders on every release; a release is not
  shipped with a known high or critical finding in shipped dependencies.
- `package-lock.json` pins exact versions in both folders, and `npm ci` installs
  exactly those.
- The internal CI workflow (`.github/workflows/build.yml`) runs the full test
  suite and the database suite on every push. Add the organization's standard
  dependency or code scanning (for example GitHub Advanced Security or
  Dependabot) to it.

## Open items

- Upgrade Vite and Vitest to current major versions (development-only findings
  above).
