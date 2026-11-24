import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cookieParser from "cookie-parser";
import { ExpressAdapter } from "@bull-board/express";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { createBullBoard } from "@bull-board/api";
import { env } from "./config/env.js";
import {
  db,
  redis,
  initializeDatabase,
  initializeSearchIndex,
} from "./db/index.js";
import { queue, worker, recoverQueuedJobs } from "./jobs/email-worker.js";
import { registerRoutes } from "./routes/index.js";
await initializeDatabase();
await initializeSearchIndex();

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(
  session({
    store: new (connectPgSimple(session))({
      pool: db,
      createTableIfMissing: true,
    }),
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 86400000,
    },
  }),
);

await recoverQueuedJobs();
setInterval(
  () =>
    recoverQueuedJobs().catch((error) =>
      console.error("Queue recovery failed", error),
    ),
  30000,
).unref();
const board = new ExpressAdapter();
const boardAdapter = new BullMQAdapter(queue);
createBullBoard({ queues: [boardAdapter], serverAdapter: board });
board.setBasePath("/admin/queues");
app.use("/admin/queues", board.getRouter());
registerRoutes(app);
app.listen(env.PORT, () =>
  console.log(`ReachInbox API listening on ${env.PORT}`),
);
process.on("SIGTERM", async () => {
  await worker.close();
  await queue.close();
  await db.end();
  redis.disconnect();
  process.exit(0);
});
