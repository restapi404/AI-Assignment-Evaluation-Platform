import { isValidSession } from "../services/sessions.js";

export function requireAuth(req, res, next) {
  const token = req.cookies?.session;
  if (!isValidSession(token)) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}