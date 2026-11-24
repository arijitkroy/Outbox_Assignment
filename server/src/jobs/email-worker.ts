import { Worker, Queue } from "bullmq";
import { db, redis } from "../db/index.js";
import { env } from "../config/env.js";
import { notifySlack } from "../services/notifications.js";
import { indexEmail } from "../services/search-index.js";
import nodemailer from "nodemailer";
export const queue = new Queue("email-send", { connection: redis });
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth:
    env.SMTP_USER && env.SMTP_PASS
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
});
export const worker = new Worker(
  "email-send",
  async (job) => {
    const { emailId, sender } = job.data as { emailId: string; sender: string };
    const rowResult = await db.query(
      "SELECT e.*,c.user_id,c.inter_send_delay_ms,c.sender_hourly_limit FROM emails e JOIN campaigns c ON c.id=e.campaign_id WHERE e.id=$1",
      [emailId],
    );
    const email = rowResult.rows[0];
    if (!email || email.status === "sent" || email.status === "failed") return;
    const now = Date.now();
    const pacingKey = `sender-next:${sender}`;
    const windowKey = `sender-limit:${sender}:${new Date(now).toISOString().slice(0, 13)}`;
    const nextAllowed = Number(
      await redis.eval(
        "local now=tonumber(ARGV[1]); local spacing=tonumber(ARGV[2]); local limit=tonumber(ARGV[3]); local hourKey=KEYS[1]; local paceKey=KEYS[2]; local count=tonumber(redis.call('GET',hourKey) or '0'); local hourEnd=math.floor(now/3600000)*3600000+3600000; if count>=limit then return hourEnd+math.random(0,60000) end; local next=tonumber(redis.call('GET',paceKey) or '0'); if next>now then return next end; redis.call('INCR',hourKey); redis.call('EXPIRE',hourKey,3700); redis.call('SET',paceKey,now+spacing,'PX',spacing+3600000); return 0",
        2,
        windowKey,
        pacingKey,
        now,
        email.inter_send_delay_ms ?? env.INTER_SEND_DELAY_MS,
        email.sender_hourly_limit ?? env.SENDER_HOURLY_LIMIT,
      ),
    );
    if (nextAllowed > now) {
      if (nextAllowed >= Math.floor(now / 3600000) * 3600000 + 3600000)
        await notifySlack(
          email.user_id,
          `Hourly send limit reached for ${sender}; queued email ${emailId} deferred until ${new Date(nextAllowed).toISOString()}`,
        );
      await queue.add(
        "send",
        { emailId, sender },
        {
          delay: nextAllowed - now,
          jobId: `email-${emailId}-defer-${nextAllowed}`,
          attempts: 5,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
      await db.query("UPDATE emails SET scheduled_at=$1 WHERE id=$2", [
        new Date(nextAllowed),
        emailId,
      ]);
      return;
    }
    try {
      await transporter.sendMail({
        from: email.sender,
        to: email.recipient,
        subject: email.subject,
        text: email.body,
      });
      await db.query(
        "UPDATE emails SET status='sent', sent_at=now(), error=NULL WHERE id=$1",
        [emailId],
      );
      const updated = (
        await db.query(
          "SELECT e.*,c.user_id FROM emails e JOIN campaigns c ON c.id=e.campaign_id WHERE e.id=$1",
          [emailId],
        )
      ).rows[0];
      await indexEmail(updated);
      await notifySlack(
        email.user_id,
        `Email sent to ${email.recipient} (campaign ${email.campaign_id})`,
      );
    } catch (error: any) {
      const attemptsMade = job.attemptsMade + 1;
      if (attemptsMade >= 5) {
        await db.query(
          "UPDATE emails SET status='failed', error=$1 WHERE id=$2",
          [String(error.message).slice(0, 1000), emailId],
        );
        await notifySlack(
          email.user_id,
          `Email failed for ${email.recipient}: ${error.message}`,
        );
      }
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: env.WORKER_CONCURRENCY,
    limiter: { max: 1000, duration: 60000 },
  },
);
worker.on("failed", (job, error) =>
  console.error("Email job failed", job?.id, error.message),
);

export async function recoverQueuedJobs() {
  const rows = await db.query(
    "SELECT e.id,e.sender,e.scheduled_at FROM emails e WHERE e.status='queued'",
  );
  for (const row of rows.rows) {
    const jobId = `email-${row.id}`;
    if (!(await queue.getJob(jobId)))
      await queue.add(
        "send",
        { emailId: row.id, sender: row.sender },
        {
          delay: Math.max(0, new Date(row.scheduled_at).getTime() - Date.now()),
          jobId,
          attempts: 5,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
  }
}
