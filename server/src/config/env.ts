import { z } from "zod";
export const env = z
  .object({
    PORT: z.coerce.number().default(3001),
    DATABASE_URL: z
      .string()
      .default("postgres://reachinbox:reachinbox@localhost:5432/reachinbox"),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    ELASTICSEARCH_URL: z.string().default("http://localhost:9200"),
    SESSION_SECRET: z
      .string()
      .min(16)
      .default("local-only-change-this-session-secret"),
    FRONTEND_URL: z.string().default("http://localhost:5173"),
    SLACK_CLIENT_ID: z.string().optional(),
    SLACK_CLIENT_SECRET: z.string().optional(),
    SLACK_REDIRECT_URI: z
      .string()
      .default("http://localhost:3001/auth/slack/callback"),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z
      .string()
      .default("http://localhost:3001/auth/google/callback"),
    SMTP_HOST: z.string().default("smtp.ethereal.email"),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default("ReachInbox <hello@example.com>"),
    SLACK_WEBHOOK_URL: z.string().optional(),
    SENDER_HOURLY_LIMIT: z.coerce.number().int().positive().default(100),
    INTER_SEND_DELAY_MS: z.coerce.number().int().min(0).default(1000),
    WORKER_CONCURRENCY: z.coerce.number().int().positive().default(10),
    TOKEN_ENCRYPTION_KEY: z
      .string()
      .min(32)
      .default("local-only-change-this-token-encryption-secret"),
  })
  .parse(process.env);
