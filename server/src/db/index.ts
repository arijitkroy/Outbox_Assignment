import pg from "pg";
import { Redis } from "ioredis";
import { Client as Elasticsearch } from "@elastic/elasticsearch";
import { env } from "../config/env.js";
export const db = new pg.Pool({ connectionString: env.DATABASE_URL });
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
export const elastic = new Elasticsearch({ node: env.ELASTICSEARCH_URL });
export async function initializeDatabase() {
  await db.query(`CREATE TABLE IF NOT EXISTS users(id text primary key, email text, name text, avatar_url text, provider text not null, created_at timestamptz not null default now());
CREATE TABLE IF NOT EXISTS oauth_states(state text primary key, provider text not null, expires_at timestamptz not null);
CREATE TABLE IF NOT EXISTS integrations(user_id text primary key references users(id) on delete cascade, slack_token text, slack_team_id text, slack_team_name text);
CREATE TABLE IF NOT EXISTS campaigns(id uuid primary key, user_id text references users(id), name text not null, status text not null default 'active', created_at timestamptz not null default now());
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS user_id text REFERENCES users(id);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS inter_send_delay_ms integer NOT NULL DEFAULT 1000;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sender_hourly_limit integer NOT NULL DEFAULT 100;
CREATE TABLE IF NOT EXISTS emails(id uuid primary key, campaign_id uuid references campaigns(id) on delete cascade, sender text not null, recipient text not null, subject text not null, body text not null, status text not null default 'queued', scheduled_at timestamptz not null, sent_at timestamptz, error text, created_at timestamptz not null default now(), idempotency_key text unique);
CREATE INDEX IF NOT EXISTS emails_campaign_created ON emails(campaign_id, created_at desc); CREATE INDEX IF NOT EXISTS emails_status_schedule ON emails(status, scheduled_at);`);
}
export async function initializeSearchIndex() {
  try {
    await elastic.indices.create({
      index: "emails",
      mappings: {
        properties: {
          campaignId: { type: "keyword" },
          userId: { type: "keyword" },
          sender: { type: "keyword" },
          recipient: { type: "keyword" },
          subject: { type: "text" },
          body: { type: "text" },
          status: { type: "keyword" },
          sentAt: { type: "date" },
        },
      },
    });
  } catch (err: any) {
    if (err?.meta?.statusCode !== 400)
      console.warn("Elasticsearch init:", err.message);
  }
}
