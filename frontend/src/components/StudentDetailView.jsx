import { useEffect, useState } from "react";
import { getRosterStudent } from "../api.js";

function accuracyColor(pct) {
  if (pct === null || pct === undefined) return "var(--graphite)";
  if (pct >= 85) return "var(--pass-green)";
  if (pct >= 60) return "var(--amber)";
  return "var(--red-pen)";
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function StudentDetailView({ rosterId, onBack, onOpenAssignment }) {
  const [student, setStudent] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setStudent(null);
    setError(null);
    getRosterStudent(rosterId)
      .then(setStudent)
      .catch((err) => setError(err.message));
  }, [rosterId]);

  return (
    <div className="card">
      <button type="button" className="nav-back" onClick={onBack} style={{ marginBottom: 12 }}>
        ◂ back to all students
      </button>

      {error && <p className="error">{error}</p>}
      {!student && !error && <p className="hint">Loading…</p>}

      {student && (
        <>
          <h2>
            {student.name} <span className="muted">· roll no. {student.rollNo}</span>
          </h2>
          <p className="hint">
            {student.submissions.length} assignment{student.submissions.length === 1 ? "" : "s"} scored
          </p>

          <table className="results-table">
            <thead>
              <tr>
                <th>Assignment</th>
                <th>Score</th>
                <th>Verdict</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {student.submissions.map((s) => (
                <tr key={s.id}>
                  <td>{s.assignmentTopic}</td>
                  <td>
                    <strong style={{ color: accuracyColor(s.score?.accuracy), fontFamily: "var(--font-mono)" }}>
                      {s.score?.accuracy ?? "—"}%
                    </strong>
                  </td>
                  <td className="muted">
                    {s.score?.verdict === "correct" && "Correct"}
                    {s.score?.verdict === "partially_correct" && "Partially correct"}
                    {s.score?.verdict === "incorrect" && "Incorrect"}
                    {!["correct", "partially_correct", "incorrect"].includes(s.score?.verdict) && "—"}
                  </td>
                  <td className="muted">{formatDate(s.createdAt)}</td>
                  <td>
                    {s.assignmentId && (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => onOpenAssignment(s.assignmentId)}
                      >
                        open
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}