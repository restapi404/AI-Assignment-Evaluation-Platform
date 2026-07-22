import { useEffect, useState } from "react";
import { listActivity } from "../api.js";

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function describeEvent(e) {
  const topic = e.details?.topic || "(untitled assignment)";
  switch (e.eventType) {
    case "assignment_created":
      return `Created assignment "${topic}"`;
    case "students_added":
      return `Scored ${e.details?.count ?? "?"} student(s) in "${topic}": ${(e.details?.names || []).join(", ")}`;
    case "assignment_updated":
      return `Edited "${topic}" (${(e.details?.updatedFields || []).join(", ") || "details"} changed)`;
    case "assignment_deleted":
      return `Deleted assignment "${topic}"`;
    case "student_deleted":
      return `Removed ${e.details?.studentName || "a student"}'s submission from "${topic}"`;
    case "regraded":
      return `Re-graded all ${e.details?.count ?? "?"} student(s) in "${topic}"`;
    default:
      return `${e.eventType} — "${topic}"`;
  }
}

export default function HistoryView() {
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listActivity()
      .then(setActivity)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="card">
      <h2>Activity log</h2>
      <p className="hint">Every assignment created, batch scored, edited, or deleted - newest first.</p>

      {error && <p className="error">{error}</p>}
      {activity === null && !error && <p className="hint">Loading…</p>}
      {activity?.length === 0 && <p className="hint">Nothing has happened yet.</p>}

      {activity?.length > 0 && (
        <ul className="activity-feed">
          {activity.map((e) => (
            <li key={e.id} className={`activity-item activity-${e.eventType}`}>
              <span className="activity-text">{describeEvent(e)}</span>
              <span className="activity-time">{formatDateTime(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}