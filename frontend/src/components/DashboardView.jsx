import { useEffect, useState } from "react";
import { listAssignments, deleteAssignment } from "../api.js";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DashboardView({ onSelect, onNew, onViewRoster }) {
  const [assignments, setAssignments] = useState(null);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  function load() {
    listAssignments()
      .then(setAssignments)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleDelete(e, id, topic) {
    e.stopPropagation();
    if (!confirm(`Delete "${topic}"? This removes all its students and scans permanently.`)) return;
    setDeletingId(id);
    try {
      await deleteAssignment(id);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  const totalAssignments = assignments?.length ?? 0;
  const totalStudents = assignments?.reduce((sum, a) => sum + a.studentCount, 0) ?? 0;
  const recent = assignments?.slice(0, 5) ?? [];

  return (
    <>
      <div className="stat-row">
        <div className="card stat-card">
          <span className="stat-number">{assignments === null ? "—" : totalAssignments}</span>
          <span className="stat-label">Assignments graded</span>
        </div>
        <button type="button" className="card stat-card stat-card-clickable" onClick={onViewRoster}>
          <span className="stat-number">{assignments === null ? "—" : totalStudents}</span>
          <span className="stat-label">Students scored</span>
        </button>
      </div>

      <div className="card">
        <h2>Recent assignments</h2>
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

        {recent.length > 0 && (
          <>
            <ul className="assignment-list">
              {recent.map((a) => (
                <li key={a.id}>
                  <button type="button" className="assignment-row" onClick={() => onSelect(a.id)}>
                    <span className="assignment-topic">{a.topic}</span>
                    <span className="assignment-row-right">
                      <span className="assignment-meta">
                        {a.studentCount}/10 scored · {formatDate(a.createdAt)}
                      </span>
                      <span
                        className="link-btn danger-link"
                        role="button"
                        tabIndex={0}
                        onClick={(e) => handleDelete(e, a.id, a.topic)}
                      >
                        {deletingId === a.id ? "deleting…" : "delete"}
                      </span>
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
    </>
  );
}