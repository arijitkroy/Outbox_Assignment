import type { Express } from "express";
import express from "express";
import { randomUUID, createHash } from "node:crypto";
import { google } from "googleapis";
import { z } from "zod";
import { env } from "../config/env.js";
import { db, redis } from "../db/index.js";
import { queue } from "../jobs/email-worker.js";
import { elastic } from "../db/index.js";
import { encryptToken, requireAuth } from "../services/auth.js";
export function registerRoutes(app: Express) {
  app.get("/api/health", async (_req, res) => {
    try {
      await db.query("SELECT 1");
      await redis.ping();
      res.json({ status: "ok", services: { postgres: "ok", redis: "ok" } });
    } catch (e) {
      res.status(503).json({ status: "degraded" });
    }
  });
  app.get("/api/auth/me", (req, res) =>
    res.json({ user: req.session.user ?? null }),
  );
  app.post("/api/auth/logout", (req, res) =>
    req.session.destroy(() => res.json({ ok: true })),
  );
  app.get("/auth/google", async (req, res) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
      return res.status(503).send("Google OAuth not configured");
    const oauth = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI,
    );
    const state = randomUUID();
    await db.query(
      "INSERT INTO oauth_states(state,provider,expires_at) VALUES($1,'google',now()+interval '10 minutes')",
      [state],
    );
    res.redirect(
      oauth.generateAuthUrl({
        access_type: "online",
        scope: ["openid", "email", "profile"],
        state,
        prompt: "select_account",
      }),
    );
  });
  app.get("/auth/google/callback", async (req, res) => {
    const { code, state } = req.query;
    if (
      typeof state !== "string" ||
      !(
        await db.query(
          "DELETE FROM oauth_states WHERE state=$1 AND provider='google' AND expires_at>now() RETURNING state",
          [state],
        )
      ).rowCount
    )
      return res.status(400).send("Invalid OAuth state");
    try {
      const oauth = new google.auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        env.GOOGLE_REDIRECT_URI,
      );
      const { tokens } = await oauth.getToken(String(code));
      oauth.setCredentials(tokens);
      const info = await google
        .oauth2({ version: "v2", auth: oauth })
        .userinfo.get();
      const user = {
        id: String(info.data.id),
        email: info.data.email ?? undefined,
        name: info.data.name ?? undefined,
        avatarUrl: info.data.picture ?? undefined,
        provider: "google",
      };
      await db.query(
        "INSERT INTO users(id,email,name,avatar_url,provider) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,name=EXCLUDED.name,avatar_url=EXCLUDED.avatar_url,provider=EXCLUDED.provider",
        [user.id, user.email, user.name, user.avatarUrl, user.provider],
      );
      req.session.user = user;
      res.redirect(env.FRONTEND_URL);
    } catch (e) {
      console.error(e);
      res.status(502).send("Google OAuth failed");
    }
  });
  app.get("/auth/slack", async (req, res) => {
    if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET)
      return res.status(503).send("Slack OAuth not configured");
    const state = randomUUID();
    await db.query(
      "INSERT INTO oauth_states(state,provider,expires_at) VALUES($1,'slack',now()+interval '10 minutes')",
      [state],
    );
    const url = new URL("https://slack.com/oauth/v2/authorize");
    url.searchParams.set("client_id", env.SLACK_CLIENT_ID);
    url.searchParams.set(
      "scope",
      "chat:write,im:write,users:read,users:read.email",
    );
    url.searchParams.set("redirect_uri", env.SLACK_REDIRECT_URI);
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });
  app.get("/auth/slack/callback", async (req, res) => {
    const { code, state } = req.query;
    if (
      typeof state !== "string" ||
      !(
        await db.query(
          "DELETE FROM oauth_states WHERE state=$1 AND provider='slack' AND expires_at>now() RETURNING state",
          [state],
        )
      ).rowCount
    )
      return res.status(400).send("Invalid OAuth state");
    try {
      const response = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.SLACK_CLIENT_ID!,
          client_secret: env.SLACK_CLIENT_SECRET!,
          code: String(code),
          redirect_uri: env.SLACK_REDIRECT_URI,
        }),
      });
      const data: any = await response.json();
      if (!data.ok) throw new Error(data.error);
      const userId = String(data.team?.id);
      const profile = await fetch("https://slack.com/api/users.info", {
        headers: { authorization: `Bearer ${data.access_token}` },
      });
      const profileData: any = await profile.json();
      const user = {
        id: userId,
        name:
          data.team?.name ??
          profileData.user?.real_name ??
          profileData.user?.name,
        email: undefined,
        avatarUrl: undefined,
        provider: "slack",
      };
      await db.query(
        "INSERT INTO users(id,email,name,avatar_url,provider) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,name=EXCLUDED.name,avatar_url=EXCLUDED.avatar_url,provider=EXCLUDED.provider",
        [user.id, user.email, user.name, user.avatarUrl, user.provider],
      );
      await db.query(
        "INSERT INTO integrations(user_id,slack_token,slack_team_id,slack_team_name) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET slack_token=EXCLUDED.slack_token,slack_team_id=EXCLUDED.slack_team_id,slack_team_name=EXCLUDED.slack_team_name",
        [
          user.id,
          encryptToken(data.access_token),
          data.team?.id,
          data.team?.name,
        ],
      );
      req.session.user = user;
      res.redirect(env.FRONTEND_URL);
    } catch (e) {
      console.error(e);
      res.status(502).send("Slack OAuth failed");
    }
  });
  const campaignSchema = z.object({
    name: z.string().trim().min(1).max(160),
    startAt: z.string().datetime().optional(),
    interSendDelayMs: z.coerce
      .number()
      .int()
      .min(0)
      .max(3600000)
      .default(env.INTER_SEND_DELAY_MS),
    senderHourlyLimit: z.coerce
      .number()
      .int()
      .positive()
      .max(100000)
      .default(env.SENDER_HOURLY_LIMIT),
    emails: z
      .array(
        z.object({
          sender: z.string().email(),
          recipient: z.string().email(),
          subject: z.string().min(1).max(500),
          body: z.string().min(1).max(50000),
          scheduledAt: z.string().datetime().optional(),
        }),
      )
      .min(1)
      .max(1000),
  });
  app.post("/api/campaigns", requireAuth, async (req, res) => {
    const parsed = campaignSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Invalid campaign", details: parsed.error.flatten() });
    const client = await db.connect();
    const campaignId = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO campaigns(id,user_id,name,inter_send_delay_ms,sender_hourly_limit) VALUES($1,$2,$3,$4,$5)",
        [
          campaignId,
          req.session.user!.id,
          parsed.data.name,
          parsed.data.interSendDelayMs,
          parsed.data.senderHourlyLimit,
        ],
      );
      const inserted: any[] = [];
      for (const item of parsed.data.emails) {
        const id = randomUUID();
        const schedule = new Date(item.scheduledAt ?? Date.now());
        await client.query(
          "INSERT INTO emails(id,campaign_id,sender,recipient,subject,body,scheduled_at,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            id,
            campaignId,
            item.sender,
            item.recipient,
            item.subject,
            item.body,
            schedule,
            createHash("sha256")
              .update(
                `${campaignId}:${item.sender}:${item.recipient}:${item.subject}:${item.body}`,
              )
              .digest("hex"),
          ],
        );
        inserted.push({ id, sender: item.sender, scheduledAt: schedule });
      }
      await client.query("COMMIT");
      for (const item of inserted)
        await queue.add(
          "send",
          { emailId: item.id, sender: item.sender },
          {
            delay: Math.max(0, item.scheduledAt.getTime() - Date.now()),
            jobId: `email-${item.id}`,
            attempts: 5,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        );
      res.status(201).json({ id: campaignId, queued: inserted.length });
    } catch (e: any) {
      await client.query("ROLLBACK");
      console.error(e);
      res.status(500).json({ error: "Campaign could not be created" });
    } finally {
      client.release();
    }
  });
  app.get("/api/campaigns", requireAuth, async (req, res) => {
    const result = await db.query(
      `SELECT c.id,c.name,c.status,c.created_at,count(e.id)::int total,count(e.id) FILTER (WHERE e.status='sent')::int sent,count(e.id) FILTER (WHERE e.status='failed')::int failed,count(e.id) FILTER (WHERE e.status='queued')::int queued FROM campaigns c LEFT JOIN emails e ON e.campaign_id=c.id WHERE c.user_id=$1 GROUP BY c.id ORDER BY c.created_at DESC`,
      [req.session.user!.id],
    );
    res.json(result.rows);
  });
  app.get("/api/campaigns/:id/emails", requireAuth, async (req, res) => {
    const result = await db.query(
      "SELECT id,sender,recipient,subject,status,scheduled_at,sent_at,error,created_at FROM emails WHERE campaign_id=$1 AND campaign_id IN (SELECT id FROM campaigns WHERE user_id=$2) ORDER BY created_at DESC LIMIT 500",
      [req.params.id, req.session.user!.id],
    );
    res.json(result.rows);
  });
  app.get("/api/emails/search", requireAuth, async (req, res) => {
    const query = String(req.query.q ?? "").trim();
    if (!query) return res.json({ hits: [] });
    try {
      const results = await elastic.search({
        index: "emails",
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query,
                  fields: ["subject", "body", "recipient", "sender"],
                },
              },
            ],
            filter: [{ term: { userId: req.session.user!.id } }],
          },
        },
      });
      res.json({
        hits: results.hits.hits.map((hit: any) => ({
          id: hit._id,
          ...hit._source,
        })),
      });
    } catch (e) {
      console.error(e);
      res.status(503).json({ error: "Search unavailable" });
    }
  });
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    const result = await db.query(
      `SELECT count(*)::int total, count(*) FILTER(WHERE e.status='sent')::int sent,count(*) FILTER(WHERE e.status='queued')::int queued,count(*) FILTER(WHERE e.status='failed')::int failed FROM emails e JOIN campaigns c ON c.id=e.campaign_id WHERE c.user_id=$1`,
      [req.session.user!.id],
    );
    res.json(result.rows[0]);
  });
  app.get("/api/integrations", requireAuth, async (req, res) => {
    const result = await db.query(
      "SELECT slack_team_name FROM integrations WHERE user_id=$1",
      [req.session.user!.id],
    );
    res.json({
      google: !!env.GOOGLE_CLIENT_ID,
      slackOAuth: !!env.SLACK_CLIENT_ID,
      slackConnected: !!result.rows[0],
      slackWorkspace: result.rows[0]?.slack_team_name ?? null,
      smtp: !!(env.SMTP_USER && env.SMTP_PASS),
      bullBoard: "/admin/queues",
    });
  });
}
