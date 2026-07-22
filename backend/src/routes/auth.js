import { Router } from "express";
import { createSession, destroySession, isValidSession } from "../services/sessions.js";

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

router.post("/login", (req, res) => {
  const { password } = req.body;
  const appPassword = process.env.APP_PASSWORD;

  if (!appPassword) {
    return res.status(500).json({ error: "APP_PASSWORD is not set in backend/.env" });
  }

  if (password !== appPassword) {
    return res.status(401).json({ error: "Incorrect password" });
  }

  const token = createSession();
  res.cookie("session", token, COOKIE_OPTIONS);
  res.json({ ok: true });
});

router.post("/logout", (req, res) => {
  const token = req.cookies?.session;
  if (token) destroySession(token);
  res.clearCookie("session", { httpOnly: true, sameSite: "lax", secure: COOKIE_OPTIONS.secure });
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  const token = req.cookies?.session;
  res.json({ loggedIn: isValidSession(token) });
});

export default router;