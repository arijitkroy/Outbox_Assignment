import { elastic } from "../db/index.js";
export async function indexEmail(row: any) {
  try {
    await elastic.index({
      index: "emails",
      id: row.id,
      document: {
        campaignId: row.campaign_id,
        userId: row.user_id,
        sender: row.sender,
        recipient: row.recipient,
        subject: row.subject,
        body: row.body,
        status: row.status,
        sentAt: row.sent_at,
      },
    });
  } catch (e) {
    console.error("Email indexing failed", e);
  }
}
