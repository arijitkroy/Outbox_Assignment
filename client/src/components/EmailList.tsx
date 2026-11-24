import { Clock3, Send, Star } from "lucide-react";
import type { Email } from "../types";
export function EmailList({
  emails,
  kind,
}: {
  emails: Email[];
  kind: "scheduled" | "sent";
}) {
  return (
    <div className="email-list">
      {emails.length ? (
        emails.map((email) => (
          <article className="email-item" key={email.id}>
            <div className="email-main">
              <div className="email-meta">
                <span>To: {email.recipient}</span>
                <span className={`email-badge ${kind}`}>
                  {kind === "scheduled" ? (
                    <>
                      <Clock3 size={12} />
                      {new Date(email.scheduled_at).toLocaleTimeString(
                        "en-US",
                        {
                          weekday: "short",
                          hour: "numeric",
                          minute: "2-digit",
                          second: "2-digit",
                        },
                      )}
                    </>
                  ) : (
                    <>
                      <Send size={12} />
                      Sent
                    </>
                  )}
                </span>
              </div>
              <strong>{email.subject}</strong>
              <p>{email.body}</p>
            </div>
            <button className="star-button" aria-label="Star email">
              <Star size={18} />
            </button>
          </article>
        ))
      ) : (
        <div className="email-empty">No {kind} emails yet.</div>
      )}
    </div>
  );
}
