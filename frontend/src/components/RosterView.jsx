import { useEffect, useState } from "react";
import { listRoster } from "../api.js";

export default function RosterView({ onSelect, onBack }) {
  const [roster, setRoster] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listRoster()
      .then(setRoster)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="card">
      <button type="button" className="nav-back" onClick={onBack} style={{ marginBottom: 12 }}>
        ◂ back to dashboard
      </button>
      <h2>All students</h2>
      <p className="hint">
        Students are matched across assignments by name + roll number. Click a student to see
        every assignment they've been scored on.
      </p>

      {error && <p className="error">{error}</p>}
      {roster === null && !error && <p className="hint">Loading…</p>}

      {roster?.length === 0 && <p className="hint">No students scored yet.</p>}

      {roster?.length > 0 && (
        <ul className="assignment-list">
          {roster.map((r) => (
            <li key={r.id}>
              <button type="button" className="assignment-row" onClick={() => onSelect(r.id)}>
                <span className="assignment-topic">
                  {r.name} <span className="muted">· roll no. {r.rollNo}</span>
                </span>
                <span className="assignment-meta">
                  {r.submissionCount} assignment{r.submissionCount === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}