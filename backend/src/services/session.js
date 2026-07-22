// Minimal in-memory session store for a single shared-password login.
// Sessions are just random tokens mapped to a creation time - no per-user
// data, since everyone shares one password. Restarting the backend clears
// all sessions (everyone has to log in again), which is an acceptable
// trade-off for an internal tool.

import crypto from "node:crypto";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const sessions = new Map(); // token -> createdAt (ms)

export function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now());
  return token;
}

export function isValidSession(token) {
  if (!token || !sessions.has(token)) return false;
  const createdAt = sessions.get(token);
  if (Date.now() - createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function destroySession(token) {
  sessions.delete(token);
}