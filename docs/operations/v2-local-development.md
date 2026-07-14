# V2 Local Development

Use Node.js 24 and npm 11. On Windows PowerShell, use `npm.cmd` if the PowerShell shim is blocked.

## Database

Copy `.env.v2.example` to `.env.v2` and set a local `DATABASE_URL` and `SESSION_SECRET`. Do not
commit the local file or print its values.

```bash
npm run db:v2:up
npm run db:v2:migrate
npm run db:v2:seed
```

The service is PostgreSQL with PostGIS on port `54329`; the API defaults to port `5100` and the Web
dev server to `5173`.

## Verification

```bash
npm run verify:v2-foundation
npm run dev:v2
npm run smoke:v2 -- --api-url http://localhost:5100 --expected-release local
```

The smoke command checks only status, JSON content type, request IDs, and the expected release. It
never prints response bodies or environment values. Existing V1 commands remain available while the
`frontend/` and `backend/` directories are frozen until Phase 8.
