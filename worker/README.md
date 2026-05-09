# Reserve Agent Worker

Cloudflare Worker that gates a D1 database with Firebase ID-token auth.

Frontend → Worker (Bearer ID token) → D1.

## Endpoints

| Method | Path           | Body / Notes                                                    |
|--------|----------------|------------------------------------------------------------------|
| GET    | `/health`      | Liveness                                                         |
| GET    | `/v1/me`       | Returns current user `{ uid, email, plan }`                      |
| POST   | `/v1/me/plan`  | `{ plan: "free" \| "pro" }`                                      |
| GET    | `/v1/state`    | Returns `{ project, chat, version, updated_at }` for the caller  |
| PUT    | `/v1/state`    | `{ project?, chat?, expectedVersion? }` — last-write-wins or 409 |
| DELETE | `/v1/state`    | Wipes the caller's state row                                     |

All `/v1/*` calls require `Authorization: Bearer <Firebase ID token>`.

## Setup

```bash
npm install
npx wrangler login

# 1. Create the D1 database
npx wrangler d1 create reserve_agent
# → copy the printed database_id into wrangler.toml (both [[d1_databases]] blocks)

# 2. Apply schema (local + remote)
npm run db:migrate:local
npm run db:migrate:remote

# 3. Set the Firebase project ID (Firebase console → project settings)
#    Edit wrangler.toml and set FIREBASE_PROJECT_ID under [vars] (and env.production.vars).

# 4. Set ALLOWED_ORIGIN to your frontend origin (http://localhost:3000 in dev,
#    your Render/Vercel domain in prod).

# 5. Develop locally
npm run dev

# 6. Deploy
npm run deploy             # default env
npx wrangler deploy --env production
```

## Schema

Single row per user. `user_state` mirrors the frontend's two `localStorage`
blobs (`reserve-agent-project-v2`, `reserve-agent-chat-v1`).

```sql
users(uid PK, email, plan, created_at, updated_at)
user_state(uid PK→users.uid, project_json, chat_json, version, updated_at)
```

`version` increments on every PUT. The frontend can optionally pass
`expectedVersion` to detect concurrent edits (HTTP 409).

## Token verification

`src/auth.ts` verifies Firebase ID tokens against Google's JWKS
(`https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`)
using Web Crypto. Keys are cached for the JWKS response's `max-age`.
