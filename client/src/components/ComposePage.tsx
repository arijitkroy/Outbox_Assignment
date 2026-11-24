import { useRef, useState } from "react";
import {
  ArrowLeft,
  Paperclip,
  Clock3,
  Bold,
  Italic,
  Underline,
  List,
  Link,
  ImagePlus,
  CalendarDays,
  X,
} from "lucide-react";
type Props = {
  onClose: () => void;
  onCreated: () => void;
  user: { id: string } | null;
};
const presets = [
  "Tomorrow",
  "Tomorrow, 10:00 AM",
  "Tomorrow, 11:00 AM",
  "Tomorrow, 3:00 PM",
];
export function ComposePage({ onClose, onCreated, user }: Props) {
  const [name, setName] = useState(""),
    [sender, setSender] = useState(""),
    [recipients, setRecipients] = useState<string[]>([]),
    [recipientInput, setRecipientInput] = useState(""),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [delay, setDelay] = useState("1000"),
    [hourlyLimit, setHourlyLimit] = useState("100"),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [scheduleOpen, setScheduleOpen] = useState(false),
    [scheduledAt, setScheduledAt] = useState(""),
    [dateText, setDateText] = useState(""),
    [attachment, setAttachment] = useState("");
  const upload = useRef<HTMLInputElement>(null);
  const imageUpload = useRef<HTMLInputElement>(null);
  function addAddresses(value: string) {
    const parsed = value
      .split(/[\n,;\t]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    setRecipients((current) => Array.from(new Set([...current, ...parsed])));
    setRecipientInput("");
  }
  function readList(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => addAddresses(String(reader.result ?? ""));
    reader.readAsText(file);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!user) {
      setError("Sign in with Google before creating campaign.");
      return;
    }
    addAddresses(recipientInput);
    const all = Array.from(
      new Set([
        ...recipients,
        ...recipientInput
          .split(/[\n,;\t]+/)
          .map((item) => item.trim())
          .filter(Boolean),
      ]),
    );
    if (!all.length) {
      setError("Enter at least one recipient email.");
      return;
    }
    setSaving(true);
    try {
      const emails = all.map((recipient) => ({
        sender,
        recipient,
        subject,
        body,
        scheduledAt: scheduledAt || undefined,
      }));
      const response = await fetch("/api/campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          interSendDelayMs: Number(delay),
          senderHourlyLimit: Number(hourlyLimit),
          emails,
        }),
      });
      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok)
        throw new Error(
          data?.error === "Authentication required"
            ? "Sign in with Google before creating campaign."
            : data?.error || `Server returned error (${response.status})`,
        );
      onCreated();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Campaign could not be created",
      );
    } finally {
      setSaving(false);
    }
  }
  function addImage(file?: File) {
    if (file) setAttachment(file.name);
  }
  return (
    <div className="compose-page">
      <div className="compose-heading">
        <button className="back-button" onClick={onClose}>
          <ArrowLeft size={18} />
          <span>Compose New Email</span>
        </button>
        <div className="compose-actions">
          <label className="attachment-action">
            <Paperclip size={17} />
            <span className="count-badge">{attachment ? 1 : 0}</span>
          </label>
          <button
            className="schedule-trigger"
            onClick={() => setScheduleOpen(!scheduleOpen)}
          >
            <Clock3 size={17} />
          </button>
          <button
            type="submit"
            form="compose-form"
            className="send-pill"
            disabled={saving}
          >
            {saving ? "Sending..." : "Send"}{" "}
            <span
              className="send-later"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setScheduleOpen(!scheduleOpen);
              }}
            >
              Send Later
            </span>
          </button>
        </div>
      </div>
      <form id="compose-form" onSubmit={submit} className="compose-form">
        <label className="compose-field">
          <span>Campaign</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Campaign name"
          />
        </label>
        <label className="compose-field">
          <span>From</span>
          <select
            required
            value={sender}
            onChange={(e) => setSender(e.target.value)}
          >
            <option value="">Select sender email</option>
            {sender && <option>{sender}</option>}
            <option value="hello@example.com">hello@example.com</option>
          </select>
        </label>
        <div className="compose-field">
          <span>To</span>
          <div className="recipient-line">
            {recipients.map((item) => (
              <button
                type="button"
                key={item}
                className="recipient-chip"
                onClick={() =>
                  setRecipients(recipients.filter((email) => email !== item))
                }
              >
                {item}
                <X size={12} />
              </button>
            ))}
            <input
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addAddresses(recipientInput);
                }
              }}
              onBlur={() => recipientInput && addAddresses(recipientInput)}
              placeholder="Add recipients"
            />
            <button
              type="button"
              className="upload-list"
              onClick={() => upload.current?.click()}
            >
              ↑ Upload List
            </button>
            <input
              ref={upload}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              hidden
              onChange={(e) => readList(e.target.files?.[0])}
            />
          </div>
        </div>
        <label className="compose-field">
          <span>Subject</span>
          <input
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
        </label>
        <div className="pacing-fields">
          <label>
            <span>Delay between 2 emails</span>
            <div>
              <input
                type="number"
                min="0"
                max="3600000"
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
              />{" "}
              ms
            </div>
          </label>
          <label>
            <span>Hourly Limit</span>
            <div>
              <input
                type="number"
                min="1"
                max="100000"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(e.target.value)}
              />{" "}
              emails
            </div>
          </label>
        </div>
        <div className="format-toolbar">
          <button type="button" aria-label="Bold">
            <Bold size={17} />
          </button>
          <button type="button" aria-label="Italic">
            <Italic size={17} />
          </button>
          <button type="button" aria-label="Underline">
            <Underline size={17} />
          </button>
          <i />
          <button type="button" aria-label="Bulleted list">
            <List size={17} />
          </button>
          <button type="button" aria-label="Insert link">
            <Link size={17} />
          </button>
          <button
            type="button"
            aria-label="Add image"
            onClick={() => imageUpload.current?.click()}
          >
            <ImagePlus size={17} />
          </button>
          <input
            ref={imageUpload}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => addImage(e.target.files?.[0])}
          />
        </div>
        <textarea
          className="email-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your email..."
          required
        />
        {attachment && (
          <div className="attachment-preview">
            <ImagePlus size={16} />
            {attachment}
            <button
              type="button"
              onClick={() => setAttachment("")}
              aria-label="Remove attachment"
            >
              <X size={14} />
            </button>
          </div>
        )}
        {error && <p className="compose-error">{error}</p>}
      </form>
      {scheduleOpen && (
        <div className="schedule-popover">
          <h3>Send Later</h3>
          <label>
            Pick date &amp; time <CalendarDays size={16} />
            <input
              type="datetime-local"
              value={dateText}
              onChange={(e) => {
                setDateText(e.target.value);
                setScheduledAt(
                  e.target.value ? new Date(e.target.value).toISOString() : "",
                );
              }}
            />
          </label>
          <div className="schedule-presets">
            {presets.map((preset, index) => (
              <button
                key={preset}
                onClick={() => {
                  const date = new Date();
                  date.setDate(date.getDate() + 1);
                  date.setHours(
                    [9, 10, 11, 15][index],
                    index === 0 ? 15 : 0,
                    index === 0 ? 12 : 0,
                    0,
                  );
                  setDateText(
                    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
                  );
                  setScheduledAt(date.toISOString());
                }}
              >
                {preset}
              </button>
            ))}
          </div>
          <footer>
            <button onClick={() => setScheduleOpen(false)}>Cancel</button>
            <button
              className="schedule-done"
              onClick={() => setScheduleOpen(false)}
            >
              Done
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
