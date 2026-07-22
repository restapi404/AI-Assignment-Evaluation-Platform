import { Router } from "express";
import { listRoster, getRosterStudent } from "../store.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    res.json(await listRoster());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const student = await getRosterStudent(req.params.id);
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json(student);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;