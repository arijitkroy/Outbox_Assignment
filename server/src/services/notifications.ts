import { db } from "../db/index.js";
import { decryptToken } from "./auth.js";
export async function notifySlack(userId: string | undefined, text: string) {
  if (!userId) return;
  try {
    const result = await db.query(
      "SELECT slack_token FROM integrations WHERE user_id=$1",
      [userId],
    );
    const token = result.rows[0]?.slack_token;
    if (token) {
      const authorization = `Bearer ${decryptToken(token)}`;
      const opened = await fetch("https://slack.com/api/conversations.open", {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify({ users: userId }),
      });
      const conversation: any = await opened.json();
      if (!conversation.ok)
        throw new Error(
          `Slack conversation open failed: ${conversation.error}`,
        );
      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify({ channel: conversation.channel.id, text }),
      });
      const result: any = await response.json();
      if (!result.ok) throw new Error(`Slack API failed: ${result.error}`);
    }
  } catch (e) {
    console.error("Slack notification failed", e);
  }
}
