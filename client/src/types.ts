export type User = {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  provider: string;
} | null;
export type Email = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  sender: string;
  scheduled_at: string;
  sent_at?: string;
  status: string;
};
export type Campaign = {
  id: string;
  name: string;
  created_at: string;
  total: number;
  sent: number;
  queued: number;
  failed: number;
};
export type Stats = {
  total: number;
  sent: number;
  queued: number;
  failed: number;
};
