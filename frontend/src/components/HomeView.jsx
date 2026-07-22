import { useEffect, useState } from "react";
import { listAssignments } from "../api.js";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function HomeView({ onSelect, onNew }) {
  const [assignments, setAssignments] = useState(null); // null = loading
  const [error, setError] = useState(null);

  useEffect(() => {
    listAssignments()
      .then(setAssignments)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="card">
      <h2>Assignments</h2>

      {error && <p className="error">{error}</p>}

      {assignments === null && !error && <p className="hint">Loading…</p>}

      {assignments?.length === 0 && (
        <div className="empty-state">
          <p>No assignments graded yet. Set up a topic and score your first batch of scans.</p>
          <button type="button" onClick={onNew}>
            + New assignment
          </button>
        </div>
      )}

      {assignments?.length > 0 && (
        <>
          <ul className="assignment-list">
            {assignments.map((a) => (
              <li key={a.id}>
                <button type="button" className="assignment-row" onClick={() => onSelect(a.id)}>
                  <span className="assignment-topic">{a.topic}</span>
                  <span className="assignment-meta">
                    {a.studentCount}/10 scored · {formatDate(a.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={onNew} style={{ marginTop: 16 }}>
            + New assignment
          </button>
        </>
      )}
    </div>
  );
}