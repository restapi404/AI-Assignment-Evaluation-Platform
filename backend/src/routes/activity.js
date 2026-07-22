import { Router } from "express";
import { listActivity } from "../store.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    res.json(await listActivity());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;