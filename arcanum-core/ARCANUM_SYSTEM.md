# ARCANUM — CENTRAL KNOWLEDGE ARCHIVE

## Product definition
Arcanum is a server-centered knowledge archive. The account is the identity boundary; PostgreSQL is the source of truth; devices are clients of the same archive.

## Main modules
- Login Gate / Authentication
- Knowledge Archive
- Categories
- Versioned Knowledge
- Book Translation Archive
- Audit History
- Account & Devices
- Administration
- Core Health / Status

## Core architecture
```text
Device / Browser
  -> Arcanum Core
  -> Authentication + API
  -> PostgreSQL Storage
```

The UI does not treat localStorage as the master database. localStorage is used only for session token/device identity/cursor state.

## Knowledge lifecycle
```text
DRAFT -> REVIEW -> APPROVED -> PUBLISHED -> ARCHIVED
                    \-> REJECTED
```

Every material edit creates a knowledge version. The current record stores the latest version number while `knowledge_versions` preserves prior states.

## Book translation lifecycle
```text
PLANNED -> READING -> TRANSLATING -> REVIEW -> COMPLETED
```

Each chapter translation is versioned in `book_translations` and can carry its own workflow status.

## Status language
- Green: success / active / approved / completed
- Blue: information / processing / reading / syncing
- Amber: pending / draft
- Orange: warning / review
- Red: error / rejected
- Violet: published / special system state
- Rose: translation workflow
- Gray: inactive / archived / planned

Status is represented by label + icon + color, not color alone.

## Account model
A user can have multiple sessions/devices. The same user ID resolves to the same server-side knowledge, books, translations, and history.

## Security model
- Passwords are stored as bcrypt hashes.
- JWT/session authentication is server-side verified.
- Authorization is checked on the server.
- Database and JWT secrets belong in deployment environment variables, never in frontend source.
- Audit entries record important actions.

## Storage model
Core tables:
`users`, `sessions`, `categories`, `knowledge`, `knowledge_versions`, `files`, `books`, `book_translations`, `audit_log`, `sync_operations`.

## Deployment model
The Node/Express service serves the static application and `/api/*` endpoints. On startup it executes `schema.sql`, initializes the optional admin account from environment variables, then listens on `PORT`.

## Operational health
`GET /api/health` verifies PostgreSQL connectivity. The UI exposes operational/sync state as a compact status badge and system-status panel.

## Design direction
Occult archival aesthetic: near-black violet surfaces, antique-gold typography/accent, geometric celestial/sigil motifs, restrained borders, and readable status badges. The visual language is decorative but the information architecture remains functional and accessible.
