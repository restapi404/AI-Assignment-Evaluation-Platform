import { Fragment, useEffect, useState } from "react";
import { getAssignment, updateAssignment, deleteAssignment, regradeAssignment, deleteStudent } from "../api.js";
import ImageModal from "./ImageModal.jsx";

function accuracyColor(pct) {
  if (pct === null || pct === undefined) return "var(--graphite)";
  if (pct >= 85) return "var(--pass-green)";
  if (pct >= 60) return "var(--amber)";
  return "var(--red-pen)";
}

function verdictLabel(verdict) {
  if (verdict === "correct") return "Correct";
  if (verdict === "partially_correct") return "Partially correct";
  if (verdict === "incorrect") return "Incorrect";
  return "—";
}

function Stamp({ pct }) {
  if (pct === null || pct === undefined) {
    return (
      <span className="stamp stamp-empty" aria-label="No score">
        n/a
      </span>
    );
  }
  return (
    <span className="stamp" style={{ color: accuracyColor(pct) }} aria-label={`${pct} percent`}>
      {Math.round(pct)}%
    </span>
  );
}

function DiffLine({ diff }) {
  if (!diff?.length) return null;
  return (
    <div className="diff-line">
      {diff.map((op, i) => {
        if (op.type === "match") return <span key={i} className="diff-match">{op.student} </span>;
        if (op.type === "substitute")
          return (
            <span key={i} className="diff-sub" title={`expected "${op.correct}"`}>
              {op.student}{" "}
            </span>
          );
        if (op.type === "missing")
          return (
            <span key={i} className="diff-missing" title="missing from student answer">
              [{op.correct}]{" "}
            </span>
          );
        if (op.type === "extra")
          return (
            <span key={i} className="diff-extra" title="extra word not in correct answer">
              {op.student}{" "}
            </span>
          );
        return null;
      })}
    </div>
  );
}

/**
 * Renders one OCR source's full grading detail: extracted text, then either
 * the semantic-grade breakdown (feedback + covered/missing points) or, if
 * that's shaped like the text-similarity fallback instead (used when
 * semantic grading failed for that source), a diff view.
 */
function SourceDetail({ label, text, score, verdict, textSimilarity }) {
  const isSemantic = score && (score.coveredPoints || score.missingPoints || score.feedback);
  const isTextSimilarityShape = score && score.diff && !isSemantic;

  return (
    <div className="source-detail">
      <div className="source-detail-heading">
        <strong>{label}</strong>
        {score?.accuracy !== undefined && score?.accuracy !== null && (
          <span className="muted">
            {score.accuracy}% {verdict ? `· ${verdictLabel(verdict)}` : ""}
          </span>
        )}
      </div>

      <p className="extracted-text">{text || <em>No text detected</em>}</p>

      {isSemantic && (
        <>
          {score.feedback && <p style={{ marginTop: 8 }}>{score.feedback}</p>}
          {score.coveredPoints?.length > 0 && (
            <>
              <strong style={{ display: "block", marginTop: 10 }}>Key points covered</strong>
              <ul>
                {score.coveredPoints.map((p, i) => (
                  <li key={i} className="point-covered">{p}</li>
                ))}
              </ul>
            </>
          )}
          {score.missingPoints?.length > 0 && (
            <>
              <strong style={{ display: "block", marginTop: 10 }}>Key points missing or wrong</strong>
              <ul>
                {score.missingPoints.map((p, i) => (
                  <li key={i} className="point-missing">{p}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {isTextSimilarityShape && (
        <>
          <p className="hint" style={{ marginTop: 8 }}>
            Semantic grading was unavailable for this source - showing literal word/char
            similarity instead (word {score.wordAccuracy}% / char {score.charAccuracy}%).
          </p>
          <p className="hint" style={{ marginTop: 0 }}>
            <span className="diff-match">matched</span>{" "}
            <span className="diff-sub">OCR/spelling mismatch</span>{" "}
            <span className="diff-missing">[missing word]</span>{" "}
            <span className="diff-extra">extra word</span>
          </p>
          <DiffLine diff={score.diff} />
        </>
      )}

      {textSimilarity && (
        <>
          <strong style={{ display: "block", marginTop: 10 }}>
            Literal text similarity (reference only — word {textSimilarity.wordAccuracy}% / char{" "}
            {textSimilarity.charAccuracy}%)
          </strong>
          <p className="hint" style={{ marginTop: 0 }}>
            <span className="diff-match">matched</span>{" "}
            <span className="diff-sub">OCR/spelling mismatch</span>{" "}
            <span className="diff-missing">[missing word]</span>{" "}
            <span className="diff-extra">extra word</span>
          </p>
          <DiffLine diff={textSimilarity.diff} />
        </>
      )}
    </div>
  );
}

export default function ResultsView({ assignment: initial, onDeleted }) {
  const [assignment, setAssignment] = useState(initial);
  const [expanded, setExpanded] = useState(null);
  const [pollError, setPollError] = useState(null);
  const [viewingImage, setViewingImage] = useState(null); // { src, alt }
  const [editing, setEditing] = useState(false);
  const [editTopic, setEditTopic] = useState(initial.topic);
  const [editAnswer, setEditAnswer] = useState(initial.correctAnswerText);
  const [saving, setSaving] = useState(false);
  const [regrading, setRegrading] = useState(false);
  const [deletingStudentId, setDeletingStudentId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [detailTab, setDetailTab] = useState({}); // studentId -> "google" | "sarvam"

  useEffect(() => {
    setAssignment(initial);
    setPollError(null);
    setEditTopic(initial.topic);
    setEditAnswer(initial.correctAnswerText);
  }, [initial]);

  useEffect(() => {
    const anyPending = assignment.students.some((s) => s.sarvamStatus === "pending");
    if (!anyPending || pollError) return;
    const interval = setInterval(async () => {
      try {
        const fresh = await getAssignment(assignment.id);
        setAssignment(fresh);
      } catch (err) {
        setPollError(
          "Lost connection to this assignment on the server (it may have restarted). " +
            "Start a new assignment to continue."
        );
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [assignment, pollError]);

  async function handleSaveEdit() {
    setActionError(null);
    setSaving(true);
    try {
      const updated = await updateAssignment(assignment.id, {
        topic: editTopic,
        correctAnswerText: editAnswer,
      });
      setAssignment(updated);
      setEditing(false);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRegrade() {
    setActionError(null);
    setRegrading(true);
    try {
      const updated = await regradeAssignment(assignment.id);
      setAssignment(updated);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setRegrading(false);
    }
  }

  async function handleDeleteAssignment() {
    if (!confirm(`Delete "${assignment.topic}"? This removes all its students and scans permanently.`)) return;
    setActionError(null);
    try {
      await deleteAssignment(assignment.id);
      onDeleted?.();
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleDeleteStudent(studentId, studentName) {
    if (!confirm(`Remove ${studentName}'s submission from this assignment?`)) return;
    setActionError(null);
    setDeletingStudentId(studentId);
    try {
      await deleteStudent(assignment.id, studentId);
      setAssignment((prev) => ({ ...prev, students: prev.students.filter((s) => s.id !== studentId) }));
    } catch (err) {
      setActionError(err.message);
    } finally {
      setDeletingStudentId(null);
    }
  }

  return (
    <div className="card">
      <div className="results-header">
        <h2 style={{ marginBottom: 0 }}>Results — {assignment.topic}</h2>
        <div className="results-header-actions">
          <button type="button" className="link-btn" onClick={() => setEditing((v) => !v)}>
            {editing ? "cancel edit" : "edit"}
          </button>
          <button type="button" className="link-btn" onClick={handleRegrade} disabled={regrading}>
            {regrading ? "re-grading…" : "re-grade all"}
          </button>
          <button type="button" className="link-btn danger-link" onClick={handleDeleteAssignment}>
            delete assignment
          </button>
        </div>
      </div>

      {editing && (
        <div className="detail-panel" style={{ marginBottom: 20 }}>
          <label style={{ marginBottom: 10 }}>
            Topic
            <input type="text" value={editTopic} onChange={(e) => setEditTopic(e.target.value)} />
          </label>
          <label style={{ marginBottom: 10 }}>
            Correct answer
            <textarea rows={4} value={editAnswer} onChange={(e) => setEditAnswer(e.target.value)} />
          </label>
          <p className="hint" style={{ marginTop: 0 }}>
            Existing scores were graded against the old answer. Use "re-grade all" above after
            saving if you want them re-scored against the new one.
          </p>
          <button type="button" onClick={handleSaveEdit} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}

      <p className="hint">
        Accuracy is graded on meaning and key-point coverage (an LLM checks whether the
        student's answer covers the same facts/conclusions as the correct answer, in their
        own words - not exact wording). Click "details" for what was covered, what was
        missed, and a literal text diff.
      </p>
      {pollError && <p className="error">{pollError}</p>}
      {actionError && <p className="error">{actionError}</p>}

      <table className="results-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Score</th>
            <th>Verdict</th>
            <th>Sarvam</th>
            <th colSpan={2}></th>
          </tr>
        </thead>
        <tbody>
          {assignment.students.map((s) => (
            <Fragment key={s.id}>
              <tr>
                <td>
                  {s.name} <span className="muted">· {s.rollNo}</span>
                </td>
                <td>
                  <Stamp pct={s.score?.accuracy} />
                </td>
                <td className="muted">{verdictLabel(s.score?.verdict)}</td>
                <td>
                  {s.sarvamStatus === "disabled" && <span className="muted">off</span>}
                  {s.sarvamStatus === "pending" && <span className="muted">checking…</span>}
                  {s.sarvamStatus === "done" && (
                    <span className="muted" style={{ color: accuracyColor(s.sarvamScore?.accuracy) }}>
                      {s.sarvamScore?.accuracy}%
                    </span>
                  )}
                  {s.sarvamStatus === "unavailable" && <span className="muted">n/a</span>}
                </td>
                <td>
                  {s.imageUrl && (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => setViewingImage({ src: s.imageUrl, alt: `${s.name}'s scan` })}
                    >
                      view image
                    </button>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  >
                    {expanded === s.id ? "hide" : "details"}
                  </button>
                  {" · "}
                  <button
                    type="button"
                    className="link-btn danger-link"
                    onClick={() => handleDeleteStudent(s.id, s.name)}
                    disabled={deletingStudentId === s.id}
                  >
                    {deletingStudentId === s.id ? "removing…" : "remove"}
                  </button>
                </td>
              </tr>
              {expanded === s.id && (
                <tr>
                  <td colSpan={6}>
                    <div className="detail-panel">
                      <div className="detail-tabs">
                        <button
                          type="button"
                          className={`detail-tab ${(detailTab[s.id] || "google") === "google" ? "detail-tab-active" : ""}`}
                          onClick={() => setDetailTab((prev) => ({ ...prev, [s.id]: "google" }))}
                        >
                          Google Vision
                        </button>
                        <button
                          type="button"
                          className={`detail-tab ${detailTab[s.id] === "sarvam" ? "detail-tab-active" : ""}`}
                          onClick={() => setDetailTab((prev) => ({ ...prev, [s.id]: "sarvam" }))}
                          disabled={s.sarvamStatus !== "done"}
                        >
                          Sarvam Vision{" "}
                          {s.sarvamStatus === "pending" && "(checking…)"}
                          {s.sarvamStatus === "unavailable" && "(unavailable)"}
                          {s.sarvamStatus === "disabled" && "(off)"}
                        </button>
                      </div>

                      {(detailTab[s.id] || "google") === "google" && (
                        <SourceDetail
                          label="Extracted text"
                          text={s.googleText}
                          score={s.score}
                          verdict={s.score?.verdict}
                          textSimilarity={s.textSimilarity}
                        />
                      )}

                      {detailTab[s.id] === "sarvam" && s.sarvamStatus === "done" && (
                        <SourceDetail
                          label="Extracted text"
                          text={s.sarvamText}
                          score={s.sarvamScore}
                          verdict={s.sarvamScore?.verdict}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      <ImageModal
        src={viewingImage?.src}
        alt={viewingImage?.alt}
        onClose={() => setViewingImage(null)}
      />
    </div>
  );
}