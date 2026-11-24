# ReachInbox

Outbound campaign dashboard with a React + TypeScript frontend and Express + TypeScript API. Sends email through SMTP (Ethereal defaults), schedules durable BullMQ jobs in Redis, stores campaign state in PostgreSQL, indexes mail in Elasticsearch, and exposes a live Bull Board queue monitor. Includes Google sign-in, optional Slack OAuth with encrypted persisted tokens, connected-workspace notifications, per-sender hourly throttling, and configurable per-campaign send spacing.

## Requirements

- Node.js 20+
- npm 10+
- Docker Desktop with Compose plugin (local PostgreSQL, Redis, Elasticsearch)
- Google OAuth credentials to sign in; SMTP account to send real email; optional Slack OAuth app / Incoming Webhook

## Quick start

1. `Copy-Item .env.example .env` and replace `SESSION_SECRET` with a random secret.
2. Set Google OAuth client ID and secret in `.env`. Register `http://localhost:3001/auth/google/callback` as authorized redirect URI. Frontend origin: `http://localhost:5173`.
3. Run dependencies: `docker compose up -d`.
4. Install: `npm install`.
5. Start: `npm run dev`.
6. Open `http://localhost:5173`, sign in with Google, create campaign.

API runs at `http://localhost:3001`; Bull Board at `http://localhost:3001/admin/queues`; health at `http://localhost:3001/api/health`.

## Environment variables

See `.env.example`. Services default to local endpoints. Google sign-in requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Slack OAuth requires `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`; create a Slack app with redirect `http://localhost:3001/auth/slack/callback` and `chat:write` OAuth scope. Slack notifications use authenticated user's stored Slack workspace connection. Set `TOKEN_ENCRYPTION_KEY` to a random secret of at least 32 characters; rotating it invalidates stored tokens. `WORKER_CONCURRENCY` controls worker concurrency. Campaign form sets start time, per-sender inter-send delay, and hourly limit; environment variables provide defaults. SMTP defaults to Ethereal host and port; set `SMTP_USER` and `SMTP_PASS` from an Ethereal account or other SMTP provider for sending. Ethereal captures email for preview and does not deliver real messages. Set `SMTP_FROM` to a verified address. Set `SENDER_HOURLY_LIMIT` and `INTER_SEND_DELAY_MS` to configure pacing.

Never commit `.env` or OAuth/SMTP credentials. Use secret manager and HTTPS in production. Change session secret. Configure trusted proxy, secure cookie, CSRF protections, OAuth app credentials, SMTP sender verification, Elasticsearch authentication/TLS, Redis authentication/TLS, and PostgreSQL TLS before public deployment. OAuth state and sessions persist in PostgreSQL; Slack access tokens are encrypted at rest using `TOKEN_ENCRYPTION_KEY`. Existing campaigns with no `user_id` remain inaccessible to authenticated users after schema upgrade; migrate ownership explicitly if retaining legacy data.

## Source layout

- `server/src/config/env.ts` validates and exports environment configuration.
- `server/src/db/index.ts` owns PostgreSQL, Redis, Elasticsearch clients, and schema/index initialization.
- `server/src/jobs/email-worker.ts` owns the BullMQ queue, delivery worker, and queued-job recovery.
- `server/src/routes/index.ts` registers API and OAuth routes.
- `server/src/services/` contains authentication/token encryption, Slack notifications, and search indexing.
- `client/src/pages/LoginPage.tsx` renders sign-in; `client/src/components/` contains reusable email-list and compose views.
- `client/src/main.tsx` wires dashboard state, navigation, and API calls; `client/src/style.css` contains shared and Figma-inspired layouts.

## API

- `GET /api/health` — PostgreSQL and Redis readiness.
- `GET /api/auth/me`, `POST /api/auth/logout` — session.
- `GET /auth/google`, `GET /auth/slack` — OAuth starts.
- `POST /api/campaigns` — authenticated creation; accepts `{ "name": "...", "emails": [{"sender":"...","recipient":"...","subject":"...","body":"...","scheduledAt":"optional ISO datetime"}] }`, maximum 1,000 recipients.
- `GET /api/campaigns` — counts by delivery state.
- `GET /api/campaigns/:id/emails` — latest recipient records.
- `GET /api/emails/search?q=...` — Elasticsearch search.
- `GET /api/dashboard/stats`, `GET /api/integrations`.
- `GET /admin/queues` — Bull Board UI.

## Scheduling and delivery guarantees

Campaign creation writes campaign and recipient records in a PostgreSQL transaction, then enqueues stable-ID BullMQ jobs. Startup and periodic recovery enqueue missing jobs for DB-queued email rows. Worker skips already-sent or failed rows; retries transient SMTP errors with exponential backoff; marks final failures; Slack notification and Elasticsearch indexing failures do not undo SMTP send. Redis hourly counters are atomic, keyed per sender and UTC hour; rate-limited jobs are rescheduled to next hour with stable unique job IDs and retained DB records. Per-sender inter-send spacing uses atomic Redis pacing. Jobs persist with Redis AOF enabled. Delivery is at-least-once: SMTP provider acceptance followed by process crash before DB status update can cause duplicate email; SMTP cannot guarantee exactly-once. Queue recovery scans queued DB rows every 30 seconds. SMTP provider acceptance followed by crash before DB update can still cause duplicate email; SMTP cannot guarantee exactly-once. Rate-limited deferral IDs are unique per deferral window and recovery schedules base job ID if absent; live infrastructure still needed to validate multi-instance race behavior.

## Scripts and tests

- `npm run dev` — API and Vite concurrently.
- `npm run build` — production builds for both workspaces.
- `npm test` — workspace tests.

Docker services unavailable in current execution environment; live integrations and email delivery require services and credentials. Build/test checks reflect local dependencies only.
