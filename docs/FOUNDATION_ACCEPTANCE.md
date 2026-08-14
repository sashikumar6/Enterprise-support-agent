# Phase 2 foundation acceptance

Phase 2 is complete when a clean clone can perform every check below without external
provider credentials or a paid account.

| Capability | Command or check        | Expected result                                                      |
| ---------- | ----------------------- | -------------------------------------------------------------------- |
| Install    | `npm ci`                | Workspace dependencies install from the lockfile.                    |
| Format     | `npm run format:check`  | Source and documentation match the repository format.                |
| Lint       | `npm run lint`          | JavaScript and TypeScript lint cleanly.                              |
| Types      | `npm run typecheck`     | Web, Worker, and core project references compile.                    |
| Tests      | `npm test`              | Phase 1 spike and Phase 2 unit/API tests pass.                       |
| Build      | `npm run build`         | Vite assets and a deployable Worker bundle are produced.             |
| Database   | `npm run migrate:local` | Versioned D1 migrations apply to local state.                        |
| Runtime    | `npm run dev`           | The Worker serves the UI and API locally.                            |
| Health     | `GET /api/v1/health`    | Returns HTTP 200, service status, and a request ID.                  |
| Readiness  | `GET /api/v1/readiness` | Validates environment and local D1, then returns HTTP 200.           |
| Browser    | `npm run test:e2e`      | Desktop and mobile Chromium verify the shell and health API.         |
| CI         | GitHub Actions          | Format, lint, types, tests, build, migration, and browser smoke run. |

The shell must remain keyboard usable and responsive. It must label Ticketmaster as a source,
not imply complete inventory, and clearly state that Scout cannot sell or issue real tickets.

## Environment inventory

| Name                   | Kind                       | Required now                                | Purpose                                  |
| ---------------------- | -------------------------- | ------------------------------------------- | ---------------------------------------- |
| `APP_ENV`              | non-secret Worker variable | yes                                         | Runtime environment validation.          |
| `DB`                   | D1 binding                 | yes                                         | Durable application state and readiness. |
| `ASSETS`               | static-assets binding      | yes                                         | Same-origin React assets.                |
| `TICKETMASTER_API_KEY` | secret                     | only for the Phase 1 live spike and Phase 3 | Ticketmaster server requests.            |

Future Stripe, AI, and speech secrets are intentionally absent until their implementation
phase. Secret values belong in ignored local files or Cloudflare secret storage, never source.
