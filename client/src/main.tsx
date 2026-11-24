import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Search,
  SlidersHorizontal,
  RotateCw,
  ChevronDown,
  Clock3,
  Send,
  Plus,
  X,
  Bell,
} from "lucide-react";
import { EmailList } from "./components/EmailList";
import { ComposePage } from "./components/ComposePage";
import { LoginPage } from "./pages/LoginPage";
import type { Campaign, Email, Stats, User } from "./types";
import "./style.css";
function App() {
  const [user, setUser] = useState<User>(null),
    [ready, setReady] = useState(false),
    [stats, setStats] = useState<Stats>({
      total: 0,
      sent: 0,
      queued: 0,
      failed: 0,
    }),
    [campaigns, setCampaigns] = useState<Campaign[]>([]),
    [emails, setEmails] = useState<Email[]>([]),
    [search, setSearch] = useState(""),
    [view, setView] = useState<"scheduled" | "sent">("scheduled"),
    [compose, setCompose] = useState(false),
    [menu, setMenu] = useState(false),
    [connected, setConnected] = useState(false);
  const refresh = async () => {
    try {
      const [me, st, cs] = await Promise.all(
        ["/api/auth/me", "/api/dashboard/stats", "/api/campaigns"].map((path) =>
          fetch(path, { credentials: "include" }),
        ),
      );
      const m = await me.json();
      setUser(m.user);
      if (st.ok) setStats(await st.json());
      if (cs.ok) {
        const rows: Campaign[] = await cs.json();
        setCampaigns(rows);
        const results = await Promise.all(
          rows.map((c) =>
            fetch(`/api/campaigns/${c.id}/emails`, { credentials: "include" }),
          ),
        );
        const lists = await Promise.all(
          results.filter((r) => r.ok).map((r) => r.json()),
        );
        setEmails(lists.flat());
      }
    } finally {
      setReady(true);
    }
  };
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (user)
      fetch("/api/integrations", { credentials: "include" })
        .then((r) => r.json())
        .then((data) => setConnected(data.slackConnected))
        .catch(() => {});
  }, [user]);
  const visible = useMemo(
    () =>
      emails.filter(
        (email) =>
          email.status === view &&
          `${email.recipient} ${email.subject} ${email.body}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [emails, view, search],
  );
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }
  if (!ready)
    return (
      <main className="login-page">
        <div className="email-empty">Loading ReachInbox...</div>
      </main>
    );
  if (!user) return <LoginPage />;
  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="onb-logo">ONB</div>
        <button className="user-card" onClick={() => setMenu(!menu)}>
          <span className="user-avatar">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" />
            ) : (
              (user.name?.[0] ?? "O")
            )}
          </span>
          <span className="user-details">
            <b>{user.name || user.email || "Current user"}</b>
            <small>{user.email || ""}</small>
          </span>
          <ChevronDown size={17} />
        </button>
        {menu && (
          <div className="user-menu">
            <a href="/auth/slack">
              {connected ? "Slack connected" : "Connect Slack"}
            </a>
            <button onClick={logout}>Logout</button>
          </div>
        )}
        <button className="compose-nav" onClick={() => setCompose(true)}>
          <Plus size={16} />
          Compose
        </button>
        <div className="core-label">CORE</div>
        <button
          className={view === "scheduled" ? "side-link active" : "side-link"}
          onClick={() => setView("scheduled")}
        >
          <Clock3 size={18} />
          Scheduled<span>{stats.queued}</span>
        </button>
        <button
          className={view === "sent" ? "side-link active" : "side-link"}
          onClick={() => setView("sent")}
        >
          <Send size={18} />
          Sent<span>{stats.sent}</span>
        </button>
        <div className="sidebar-footer">
          <button>
            <Bell size={17} />
            Notifications
          </button>
          <small>
            Slack notifications {connected ? "connected" : "available"}
          </small>
        </div>
      </aside>
      <main className="dashboard-main">
        <div className="dashboard-search">
          <Search size={19} />
          <input
            placeholder="Search emails"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span className="search-separator" />
          <button aria-label="Filter">
            <SlidersHorizontal size={19} />
          </button>
          <button aria-label="Reload" onClick={() => refresh()}>
            <RotateCw size={18} />
          </button>
        </div>
        <section className="mail-view">
          <div className="mail-view-heading">
            <div>
              <h1>{view === "scheduled" ? "Scheduled" : "Sent"}</h1>
              <p>
                {view === "scheduled"
                  ? "Emails waiting to be sent"
                  : "Emails successfully sent"}
              </p>
            </div>
            <button className="compose-nav" onClick={() => setCompose(true)}>
              <Plus size={16} />
              Compose
            </button>
          </div>
          <EmailList emails={visible} kind={view} />
        </section>
      </main>
      {compose && (
        <ComposePage
          user={user}
          onClose={() => setCompose(false)}
          onCreated={() => {
            setCompose(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
