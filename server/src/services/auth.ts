import { type Request, type Response, type NextFunction } from "express";
import {
  createCipheriv,
  createDecipheriv,
  scryptSync,
  randomBytes,
} from "node:crypto";
import { env } from "../config/env.js";
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session.user) return next();
  res.status(401).json({ error: "Authentication required" });
}

const tokenKey = scryptSync(env.TOKEN_ENCRYPTION_KEY, "reachinbox-oauth", 32);
export function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}
export function decryptToken(value: string) {
  const [iv, tag, data] = value.split(":");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    tokenKey,
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
