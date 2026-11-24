# ReachInbox

Outbound campaign dashboard with a React + TypeScript frontend and Express + TypeScript API. Sends email through SMTP (Ethereal defaults), schedules durable BullMQ jobs in Redis, stores campaign state in PostgreSQL, indexes mail in Elasticsearch, and exposes a live Bull Board queue monitor. Includes Google sign-in, optional Slack OAuth with encrypted persisted tokens, connected-workspace notifications, per-sender hourly throttling, and configurable per-campaign send spacing.

## Requirements

- Node.js 20+
- npm 10+
- Docker Desktop with Compose plugin (local PostgreSQL, Redis, Elasticsearch)
- Google OAuth credentials to sign in; SMTP account to send real email; optional Slack OAuth app / Incoming Webhook

## Local development setup

Follow these steps from a PowerShell window on Windows, or adapt the commands for your shell.

### 1. Check prerequisites

Install Node.js 20 or newer, npm 10 or newer, and Docker Desktop with the Docker Compose plugin. Start Docker Desktop before continuing. Check that Docker responds:

```powershell
docker version
docker compose version
node --version
npm --version
```

### 2. Create local environment file

From repository root (`D:\ReachInbox`):

```powershell
Copy-Item .env.example .env
```

Open `.env` in your editor. Do not commit this file or paste its contents into chat; it contains passwords and OAuth secrets.

Generate two separate random secrets in PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Run the command twice. Put one value in `SESSION_SECRET` and the other in `TOKEN_ENCRYPTION_KEY`. Keep the encryption key safe: changing it makes already-saved Slack tokens unreadable.

### 3. Configure OAuth providers

Google sign-in requires a Google OAuth client:

1. In Google Cloud Console, create or select a project and configure the OAuth consent screen.
2. Create an OAuth client ID of type **Web application**.
3. Add `http://localhost:3001/auth/google/callback` under **Authorized redirect URIs**.
4. Add `http://localhost:5173` under **Authorized JavaScript origins** if the Google Console asks for origins.
5. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.
6. Keep `GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback`.

Slack connection and rate-limit alerts are optional for local startup, but require a Slack app:

1. Create a Slack app and enable OAuth & Permissions.
2. Add `http://localhost:3001/auth/slack/callback` as a redirect URL.
3. Add bot token scopes `chat:write`, `im:write`, `users:read`, and `users:read.email`; reinstall the app after changing scopes.
4. Set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `SLACK_REDIRECT_URI=http://localhost:3001/auth/slack/callback` in `.env`.
5. Start the app, sign in, then choose **Connect Slack** from the user menu.

The API handles OAuth callbacks on port 3001 and redirects to the frontend on port 5173. Register the callback URLs exactly as written. These localhost URLs are for local development only; production requires public HTTPS URLs.

### 4. Configure test email delivery

Create an account at [Ethereal Email](https://ethereal.email/create). Copy its generated SMTP username and password into `SMTP_USER` and `SMTP_PASS`. Keep `SMTP_HOST=smtp.ethereal.email` and `SMTP_PORT=587`; use the provided account as `SMTP_FROM` if needed. Ethereal captures email for preview and does not deliver messages to real inboxes. SMTP values can remain blank until you want to test sending; the API and dashboard still start, but sending will fail until a working SMTP account is configured.

### 5. Start database, queue, and search services

Start PostgreSQL, Redis, and Elasticsearch:

```powershell
docker compose up -d postgres redis elasticsearch
```

Wait until each service reports healthy:

```powershell
docker compose ps
```

The Compose defaults use ports 5432 (PostgreSQL), 6379 (Redis), and 9200 (Elasticsearch). Keep the local URLs in `.env`:

```dotenv
DATABASE_URL=postgres://reachinbox:reachinbox@localhost:5432/reachinbox
REDIS_URL=redis://localhost:6379
ELASTICSEARCH_URL=http://localhost:9200
```

### 6. Install dependencies and run app locally

From repository root:

```powershell
npm install
npm run dev
```

Keep this terminal open while using the app. The command runs the Express API and Vite frontend together.

### 7. Open and verify the app

- Dashboard: `http://localhost:5173`
- Backend health: `http://localhost:3001/api/health`
- Bull Board: `http://localhost:3001/admin/queues`
- Elasticsearch: `http://localhost:9200`

The login page requires valid Google OAuth credentials. After signing in, compose a campaign and schedule messages. View scheduled and sent messages in the dashboard; email previews appear in your Ethereal account.

### Run the entire stack with Docker Compose

Alternatively, `.env` must exist first. Then build and start database, Redis, Elasticsearch, API, and frontend containers together:

```powershell
docker compose up --build -d
```

Open the same dashboard URL, `http://localhost:5173`. To inspect status and logs:

```powershell
docker compose ps
docker compose logs -f server client
```

Stop containers while preserving database and queue data:

```powershell
docker compose down
```

To stop and delete stored database, Redis, and Elasticsearch data, run `docker compose down -v`. This permanently removes local persisted data. Do not use `-v` unless you intend to erase it.

### Troubleshooting

- **Port already in use:** stop the process using the port or update the corresponding Compose port mapping and local URLs consistently.
- **Frontend opens but API returns 502:** check `docker compose ps` and `docker compose logs --tail 100 server`; server container must be running.
- **OAuth redirect mismatch:** ensure Google/Slack console redirect URL exactly matches `.env`, including scheme, hostname, port, path, and trailing-slash behavior.
- **Docker image pull EOF:** verify network access to Docker Hub and `production.cloudfront.docker.com`, then retry `docker compose pull`.
- **Emails fail:** verify Ethereal SMTP credentials, sender address, and `docker compose logs server`.

## Environment variables

See `.env.example`. Services default to local endpoints. Google sign-in requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Slack OAuth requires `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`; create a Slack app with redirect `http://localhost:3001/auth/slack/callback` and `chat:write` OAuth scope. Slack notifications use authenticated user's stored Slack workspace connection. Set `TOKEN_ENCRYPTION_KEY` to a random secret of at least 32 characters; rotating it invalidates stored tokens. `WORKER_CONCURRENCY` controls worker concurrency. Campaign form sets start time, per-sender inter-send delay, and hourly limit; environment variables provide defaults. SMTP defaults to Ethereal host and port; set `SMTP_USER` and `SMTP_PASS` from an Ethereal account or other SMTP provider for sending. Ethereal captures email for preview and does not deliver real messages. Set `SMTP_FROM` to a verified address. Set `SENDER_HOURLY_LIMIT` and `INTER_SEND_DELAY_MS` to configure pacing.

Never commit `.env` or OAuth/SMTP credentials. Use secret manager and HTTPS in production. Change session secret. Configure trusted proxy, secure cookie, CSRF protections, OAuth app credentials, SMTP sender verification, Elasticsearch authentication/TLS, Redis authentication/TLS, and PostgreSQL TLS before public deployment. OAuth state and sessions persist in PostgreSQL; Slack access tokens are encrypted at rest using `TOKEN_ENCRYPTION_KEY`. Existing campaigns with no `user_id` remain inaccessible to authenticated users after schema upgrade; migrate ownership explicitly if retaining legacy data.

## Architecture

The repository is a TypeScript monorepo with two application services and three stateful infrastructure services. The browser client talks to the Express API over same-origin `/api` and `/auth` routes in production; local Vite proxies those paths to `http://localhost:3001`. Docker Compose connects containers through service DNS names and waits for infrastructure health before starting the API.

```text
Browser
  | HTTPS /api, /auth, /admin
  v
React + Vite client (client)
  | same-origin API requests
  v
Express API + BullMQ worker (server)
  |             |             |             |
  v             v             v             v
PostgreSQL     Redis       Elasticsearch   SMTP provider
(users,        (durable     (email search)  (Ethereal by
sessions,      jobs,                         default)
campaigns,     counters)
emails)
```

### Service responsibilities

- **Client:** React and TypeScript dashboard, Google sign-in entry point, scheduled/sent views, search UI, compose form, CSV/TXT recipient parsing, pacing controls, and Slack connection entry point. Production serves the built client with Nginx; local development uses Vite.
- **API:** Express endpoints, OAuth callbacks, session handling, campaign persistence, dashboard statistics, email search, and Bull Board UI.
- **Worker:** BullMQ worker runs in the API process with configurable `WORKER_CONCURRENCY`. It sends via configured SMTP, applies per-sender pacing and hourly caps using atomic Redis operations, retries transient failures, and updates email state in PostgreSQL.
- **PostgreSQL:** Source of truth for users, OAuth state, sessions, Slack integration credentials, campaigns, and email status/content. Schema initialization creates required tables and indexes.
- **Redis:** BullMQ persistence and shared per-sender/hour rate counters and pacing keys. Compose enables Redis AOF persistence.
- **Elasticsearch:** Indexes messages for full-text search. PostgreSQL remains authoritative; indexing failures are logged and do not reverse send status.
- **SMTP:** Ethereal is a testing sink, not a delivery provider. It accepts messages for preview but does not deliver to recipients' inboxes.

### Request and email flow

1. User signs in through Google OAuth. The backend validates OAuth state, stores user details, and creates a PostgreSQL-backed session.
2. Client submits campaign name, sender, recipients, subject/body, optional start time, inter-send delay, and sender hourly cap to `POST /api/campaigns`.
3. API validates the payload, writes campaign and recipient rows in a PostgreSQL transaction, commits, and creates one delayed BullMQ job per recipient with a stable job ID.
4. Worker fetches each recipient row before sending. A Redis Lua script atomically checks hourly quota and send pacing across workers. If quota is exhausted, worker delays the email into a later hour; otherwise it reserves quota/pacing and sends via SMTP.
5. Successful SMTP acceptance updates the row to `sent`; terminal failures update it to `failed`. Search index and Slack notification are updated/notified best-effort.
6. Dashboard polls API for campaign/email state. Email search queries Elasticsearch. Bull Board displays live BullMQ queue state at `/admin/queues`.

### Restart behavior and delivery semantics

BullMQ delayed jobs are persisted in Redis; PostgreSQL stores campaign and recipient state. API startup and periodic recovery query queued database rows and add jobs missing from Redis, so persisted future work can continue after service restarts. Stable job IDs reduce duplicate enqueueing, and worker skips rows already marked sent or failed. This is **at-least-once delivery**, not a strict exactly-once guarantee: if SMTP accepts a message and the process crashes before PostgreSQL records `sent`, a retry may send it again. SMTP providers generally do not support transactional commits with PostgreSQL.

### Rate limits and throughput

Worker concurrency is configured with `WORKER_CONCURRENCY`. Compose defaults to `10`; set an appropriate value for provider and database capacity. Campaign form configures delay in milliseconds between sends and maximum emails per sender/hour. Environment defaults are `INTER_SEND_DELAY_MS` and `SENDER_HOURLY_LIMIT`. Redis atomic counters are keyed by sender and UTC hour, shared across workers and application instances. At the hourly cap, jobs remain queued and are rescheduled for the next available hour; they are not discarded. A Slack message is sent to a connected Slack workspace when the cap is reached. Under a large same-time batch, BullMQ stores jobs durably; worker concurrency and per-sender limits spread actual sending over time. The Redis limiter configured on the worker also caps aggregate processing to 1,000 jobs per 60 seconds.

### Deployment topology

For local use, Docker Compose runs the complete stack and persists PostgreSQL, Redis, and Elasticsearch data in named volumes. For Vercel, `vercel.json` defines `client` and `server` services, routes `/api/*`, `/auth/*`, and `/admin/*` to the backend, and sends the remaining routes to the client. The browser uses relative same-origin paths, so no client-to-server binding is required. PostgreSQL, Redis, and Elasticsearch still need externally hosted persistent services; Vercel functions are not a replacement for a durable, continuously running BullMQ worker. Verify Vercel's current multi-service runtime support for the account/project before relying on it for background processing.

## Feature implementation

### Backend

- Express + TypeScript API with Zod request validation and PostgreSQL persistence.
- BullMQ delayed jobs backed by Redis, stable per-recipient job IDs, startup/periodic recovery, worker concurrency, and Bull Board visibility.
- SMTP delivery through Ethereal-compatible configuration, retry/backoff, sent/failed state, and failure details.
- Configurable per-campaign delay and sender hourly limit, with atomic Redis-based shared counters and rescheduling when limits are reached.
- PostgreSQL-backed sessions and OAuth state; Google OAuth user profile persistence; encrypted Slack OAuth token storage and connected-workspace notifications.
- Elasticsearch email indexing and full-text search scoped to the signed-in user.
- Health endpoint and Docker Compose services for PostgreSQL, Redis, Elasticsearch, API, and client.

### Frontend

- Google login page and dashboard header/profile with user name, email, avatar, and logout.
- Scheduled and sent email views with recipient, subject, status/time, search, loading, and empty states.
- Compose view with campaign name, sender, recipients, CSV/TXT upload and address parsing, subject/body, start time presets/custom date, delay, hourly cap, and result/error feedback.
- Slack connection action in the account menu and link to live queue monitor.
- Responsive React/TypeScript components styled to follow supplied Figma screens.

### Known constraints

- Email status `sent` means SMTP accepted the message; with Ethereal, it is available as a preview and is not delivered to a real inbox.
- OAuth, SMTP, Slack, and cloud database/search credentials are external setup requirements and must be supplied outside source control.
- Strict exactly-once email sending cannot be guaranteed across SMTP/DB failures; see restart semantics above.
- End-to-end integration depends on credentials and reachable services; unit/build checks do not verify provider delivery.

## Source layout

- `server/src/config/env.ts` validates and exports environment configuration.
- `server/src/db/index.ts` owns PostgreSQL, Redis, Elasticsearch clients, and schema/index initialization.
- `server/src/jobs/email-worker.ts` owns the BullMQ queue, delivery worker, and queued-job recovery.
- `server/src/routes/index.ts` registers API and OAuth routes.
- `server/src/services/` contains authentication/token encryption, Slack notifications, and search indexing.
- `client/src/pages/LoginPage.tsx` renders sign-in; `client/src/components/` contains reusable email-list and compose views.
- `client/src/main.tsx` wires dashboard state, navigation, and API calls; `client/src/style.css` contains shared and Figma-inspired layouts.

## API

- `GET /api/health` - PostgreSQL and Redis readiness.
- `GET /api/auth/me`, `POST /api/auth/logout` - session.
- `GET /auth/google`, `GET /auth/slack` - OAuth starts.
- `POST /api/campaigns` - authenticated creation; accepts `{ "name": "...", "emails": [{"sender":"...","recipient":"...","subject":"...","body":"...","scheduledAt":"optional ISO datetime"}] }`, maximum 1,000 recipients.
- `GET /api/campaigns` - counts by delivery state.
- `GET /api/campaigns/:id/emails` - latest recipient records.
- `GET /api/emails/search?q=...` - Elasticsearch search.
- `GET /api/dashboard/stats`, `GET /api/integrations`.
- `GET /admin/queues` - Bull Board UI.

## Scheduling and delivery guarantees

Campaign creation writes campaign and recipient records in a PostgreSQL transaction, then enqueues stable-ID BullMQ jobs. Startup and periodic recovery enqueue missing jobs for DB-queued email rows. Worker skips already-sent or failed rows; retries transient SMTP errors with exponential backoff; marks final failures; Slack notification and Elasticsearch indexing failures do not undo SMTP send. Redis hourly counters are atomic, keyed per sender and UTC hour; rate-limited jobs are rescheduled to next hour with stable unique job IDs and retained DB records. Per-sender inter-send spacing uses atomic Redis pacing. Jobs persist with Redis AOF enabled. Delivery is at-least-once: SMTP provider acceptance followed by process crash before DB status update can cause duplicate email; SMTP cannot guarantee exactly-once. Queue recovery scans queued DB rows every 30 seconds. SMTP provider acceptance followed by crash before DB update can still cause duplicate email; SMTP cannot guarantee exactly-once. Rate-limited deferral IDs are unique per deferral window and recovery schedules base job ID if absent; live infrastructure still needed to validate multi-instance race behavior.

## Scripts and tests

- `npm run dev` - API and Vite concurrently.
- `npm run build` - production builds for both workspaces.
- `npm test` - workspace tests.

Docker services unavailable in current execution environment; live integrations and email delivery require services and credentials. Build/test checks reflect local dependencies only.
