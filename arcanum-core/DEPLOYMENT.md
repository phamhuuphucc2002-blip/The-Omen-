# Arcanum — Clean Deployment Specification

## Goal
Run Arcanum independently from the previous broken Render deployment while keeping the existing GitHub source, Core API, authentication, PostgreSQL schema, knowledge archive, book translation, history, and multi-device synchronization.

## Architecture

Browser
  -> HTTPS Web App
  -> Node.js/Express API
  -> PostgreSQL

The browser must never be the source of truth. Authentication, sessions, knowledge, books, translations, history, and device records live on the server/database.

## Required environment variables

- `PORT` — supplied by hosting provider.
- `DATABASE_URL` — PostgreSQL connection string supplied by the hosting provider.
- `JWT_SECRET` — long random secret, generated in the hosting provider's secret manager.
- `ARCANUM_ADMIN_USERNAME` — initial administrator username.
- `ARCANUM_ADMIN_EMAIL` — initial administrator email.
- `ARCANUM_ADMIN_PASSWORD` — initial administrator password; never commit this value to Git.

## Deployment requirements

1. Node.js service must execute `npm install` and `npm start` from `arcanum-core`.
2. PostgreSQL must be reachable from the Node service.
3. Run `schema.sql` once during initialization or through the provider's migration mechanism.
4. The service must expose `/api/health` and return HTTP 200 only when the application is ready.
5. `/api/auth/login` must authenticate against PostgreSQL, not localStorage.
6. Every protected endpoint must require the server-issued session/JWT.
7. The same account must retrieve the same server-side data from every authorized device.
8. Secrets must exist only in the provider secret manager/environment, never in repository files.

## Production acceptance test

- Open the public HTTPS URL.
- Login with the administrator account configured in the hosting secret manager.
- Create one knowledge item.
- Logout.
- Login from a second device/browser using the same account.
- Confirm the knowledge item is visible.
- Add a translation from device 2.
- Return to device 1 and confirm the translation and history are visible.
- Confirm `/api/health` remains HTTP 200.

The previous Render service is not required by this specification and should not be treated as the source of truth.