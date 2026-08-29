import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import {
  createAssignment,
  getAssignment,
  listAssignments,
  updateAssignment,
  deleteAssignment,
  addStudents,
  deleteStudent,
  updateStudentScore,
  updateStudentSarvam,
  logEvent,
} from "../store.js";
import { extractTextGoogle } from "../services/googleVision.js";
import { scoreAnswer } from "../services/scoring.js";
import { uploadStudentImage } from "../services/storage.js";
import { extractTextBatchSarvam } from "../services/sarvamVision.js";
import { gradeSemantically } from "../services/semanticGrader.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const router = Router();

// ── Upload safety ────────────────────────────────────────────────────────────
// Rate limit: caps how many upload requests a single IP can make per minute,
// protecting the OCR/semantic-grading pipeline (and the Google Vision / Sarvam
// API quotas behind it) from abuse.
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many uploads. Please wait a minute and try again." },
});

// File-type validation: multer's fileSize limit alone doesn't stop someone
// from uploading a non-image file. This checks the MIME type reported for
// every file (single or array) before any OCR/grading work is done on it.
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

function validateFileTypes(req, res, next) {
  const files = req.files || (req.file ? [req.file] : []);
  for (const f of files) {
    if (!ALLOWED_MIME_TYPES.includes(f.mimetype)) {
      return res.status(400).json({
        error: `Unsupported file type: ${f.mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
      });
    }
  }
  next();
}
// ─────────────────────────────────────────────────────────────────────────────

// --- Create a new assignment ------------------------------------------------
router.post("/", uploadLimiter, upload.single("correctAnswerImage"), validateFileTypes, async (req, res) => {
  try {
    const { topic, correctAnswerText } = req.body;
    if (!topic) return res.status(400).json({ error: "topic is required" });

    let resolvedCorrectText = (correctAnswerText || "").trim();
    let correctAnswerImageOcr = null;

    if (req.file) {
      const { text } = await extractTextGoogle(req.file.buffer);
      correctAnswerImageOcr = text;
      if (!resolvedCorrectText) resolvedCorrectText = text;
    }

    if (!resolvedCorrectText) {
      return res.status(400).json({
        error: "Provide correctAnswerText, a correctAnswerImage, or both.",
      });
    }

    const assignment = await createAssignment({
      topic,
      correctAnswerText: resolvedCorrectText,
      correctAnswerImageOcr,
    });

    res.status(201).json(assignment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    res.json(await listAssignments());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const assignment = await getAssignment(req.params.id);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });
    res.json(assignment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Edit an assignment's topic and/or correct answer -----------------------
router.patch("/:id", async (req, res) => {
  try {
    const existing = await getAssignment(req.params.id);
    if (!existing) return res.status(404).json({ error: "Assignment not found" });

    const { topic, correctAnswerText } = req.body;
    if (topic === undefined && correctAnswerText === undefined) {
      return res.status(400).json({ error: "Provide topic and/or correctAnswerText to update." });
    }

    await updateAssignment(req.params.id, { topic, correctAnswerText });
    res.json(await getAssignment(req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Delete an assignment (and its students + stored images) ----------------
router.delete("/:id", async (req, res) => {
  try {
    const existing = await getAssignment(req.params.id);
    if (!existing) return res.status(404).json({ error: "Assignment not found" });

    await deleteAssignment(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Re-grade all students against the current correct answer ---------------
// Uses the already-extracted OCR text (no new OCR calls needed) - useful
// after editing the correct answer, since existing scores were graded
// against the old one.
router.post("/:id/regrade", async (req, res) => {
  try {
    const assignment = await getAssignment(req.params.id);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    for (const student of assignment.students) {
      const textSimilarity = scoreAnswer(assignment.correctAnswerText, student.googleText);

      let semanticGrade;
      try {
        semanticGrade = await gradeSemantically(assignment.correctAnswerText, student.googleText);
      } catch (err) {
        console.error("Re-grade: semantic grading failed, falling back to text similarity:", err.message);
        semanticGrade = {
          accuracy: textSimilarity.accuracy ?? 0,
          verdict: "unknown",
          feedback: "Semantic grading unavailable - showing text-similarity score instead.",
          coveredPoints: [],
          missingPoints: [],
        };
      }

      await updateStudentScore(student.id, { score: semanticGrade, textSimilarity });
    }

    await logEvent(assignment.id, "regraded", {
      topic: assignment.topic,
      count: assignment.students.length,
    });

    res.json(await getAssignment(req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Upload up to 10 student scans in one go --------------------------------
router.post("/:id/students", uploadLimiter, upload.array("photos", 10), validateFileTypes, async (req, res) => {
  try {
    const assignment = await getAssignment(req.params.id);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    const names = JSON.parse(req.body.names || "[]");
    const rollNos = JSON.parse(req.body.rollNos || "[]");
    if (!req.files?.length) return res.status(400).json({ error: "No photos uploaded" });

    if (names.some((n) => !n?.trim()) || rollNos.some((r) => !r?.trim())) {
      return res.status(400).json({ error: "Every student needs both a name and a roll number." });
    }

    const remainingSlots = 10 - assignment.students.length;
    if (req.files.length > remainingSlots) {
      return res.status(400).json({ error: `Only ${remainingSlots} student slot(s) left in this batch of 10.` });
    }

    const scoredStudents = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const studentName = names[i];
      const rollNo = rollNos[i];
      const filename = `${String(assignment.students.length + i + 1).padStart(2, "0")}_${studentName.replace(/\s+/g, "_")}.jpg`;

      const imagePath = await uploadStudentImage(assignment.id, filename, file.buffer, file.mimetype);

      const { text: googleText, confidence } = await extractTextGoogle(file.buffer);
      const textSimilarity = scoreAnswer(assignment.correctAnswerText, googleText);

      let semanticGrade;
      try {
        semanticGrade = await gradeSemantically(assignment.correctAnswerText, googleText);
      } catch (err) {
        console.error("Semantic grading failed, falling back to text similarity:", err.message);
        semanticGrade = {
          accuracy: textSimilarity.accuracy ?? 0,
          verdict: "unknown",
          feedback: "Semantic grading unavailable - showing text-similarity score instead.",
          coveredPoints: [],
          missingPoints: [],
        };
      }

      scoredStudents.push({
        name: studentName,
        rollNo,
        filename,
        imagePath,
        googleText,
        googleConfidence: confidence,
        sarvamText: null,
        sarvamStatus: "pending", // pending | done | unavailable | disabled
        score: semanticGrade,
        textSimilarity,
      });
    }

    const inserted = await addStudents(assignment.id, scoredStudents);

    await logEvent(assignment.id, "students_added", {
      topic: assignment.topic,
      count: inserted.length,
      names: inserted.map((s) => s.name),
    });

    res.status(201).json({ added: inserted });

    // Fire-and-forget: run the Sarvam cross-check in the background so the
    // response above doesn't wait on the async job. Each student's row
    // updates individually as results come in; the frontend polls for it.
    runSarvamCrossCheck(assignment.id, inserted).catch((err) => {
      console.error("Sarvam cross-check failed:", err.message);
      inserted.forEach((s) => {
        updateStudentSarvam(s.id, { sarvamText: null, sarvamStatus: "unavailable", sarvamScore: null }).catch(
          () => {}
        );
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

async function runSarvamCrossCheck(assignmentId, students) {
  // We don't keep image buffers around after upload (they're already in
  // Supabase Storage), so re-fetch each student's image for the Sarvam batch.
  const assignment = await getAssignment(assignmentId);
  const byId = new Map(assignment.students.map((s) => [s.id, s]));

  const filesWithBuffers = [];
  for (const s of students) {
    const full = byId.get(s.id);
    if (!full?.imageUrl) continue;
    const res = await fetch(full.imageUrl);
    const buffer = Buffer.from(await res.arrayBuffer());
    filesWithBuffers.push({ filename: full.filename, buffer });
  }

  const textByFilename = await extractTextBatchSarvam(filesWithBuffers, { language: "en-IN" });

  for (const s of students) {
    const full = byId.get(s.id);
    const sarvamText = textByFilename.get(full?.filename);
    if (sarvamText) {
      let sarvamScore;
      try {
        sarvamScore = await gradeSemantically(assignment.correctAnswerText, sarvamText);
      } catch {
        sarvamScore = scoreAnswer(assignment.correctAnswerText, sarvamText);
      }
      await updateStudentSarvam(s.id, { sarvamText, sarvamStatus: "done", sarvamScore });
    } else {
      await updateStudentSarvam(s.id, { sarvamText: null, sarvamStatus: "unavailable", sarvamScore: null });
    }
  }
}

// --- Delete a single student (and their stored image) ------------------------
router.delete("/:id/students/:studentId", async (req, res) => {
  try {
    await deleteStudent(req.params.studentId);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;