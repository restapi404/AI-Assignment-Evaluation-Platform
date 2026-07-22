import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth.js";
import assignmentsRouter from "./routes/assignments.js";
import activityRouter from "./routes/activity.js";
import rosterRouter from "./routes/roster.js";
import { requireAuth } from "./middleware/auth.js";

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    googleConfigured: Boolean(process.env.GOOGLE_VISION_API_KEY),
    sarvamConfigured: Boolean(process.env.SARVAM_API_KEY),
    authConfigured: Boolean(process.env.APP_PASSWORD),
  });
});

app.use("/api/auth", authRouter);
app.use("/api/assignments", requireAuth, assignmentsRouter);
app.use("/api/activity", requireAuth, activityRouter);
app.use("/api/roster", requireAuth, rosterRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Handwriting accuracy backend running on http://localhost:${PORT}`);
});