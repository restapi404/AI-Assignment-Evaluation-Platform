import { useState } from "react";
import { uploadStudents } from "../api.js";

export default function UploadStudents({ assignment, onUploaded }) {
  const [rows, setRows] = useState([]); // { file, name, rollNo }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function handleFiles(fileList) {
    const files = Array.from(fileList).slice(0, 10 - assignment.students.length);
    const newRows = files.map((file) => ({
      file,
      name: file.name.replace(/\.[^.]+$/, ""),
      rollNo: "",
    }));
    setRows((prev) => [...prev, ...newRows].slice(0, 10 - assignment.students.length));
  }

  function updateRow(index, field, value) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function removeRow(index) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!rows.length) return;
    setError(null);

    if (rows.some((r) => !r.name.trim() || !r.rollNo.trim())) {
      setError("Every student needs both a name and a roll number.");
      return;
    }

    setLoading(true);
    try {
      const result = await uploadStudents(assignment.id, {
        photos: rows.map((r) => r.file),
        names: rows.map((r) => r.name),
        rollNos: rows.map((r) => r.rollNo),
      });
      onUploaded(result.added);
      setRows([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const remaining = 10 - assignment.students.length - rows.length;

  return (
    <div className="card">
      <h2>Upload student scans ({assignment.students.length + rows.length}/10)</h2>
      <p className="hint">
        Name + roll number identify a student across assignments - use the same spelling and
        roll number each time so their history links up correctly.
      </p>

      <input
        type="file"
        accept="image/*"
        multiple
        disabled={remaining <= 0}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {remaining <= 0 && <p className="hint">10-student batch is full.</p>}

      {rows.length > 0 && (
        <table className="rows-table">
          <thead>
            <tr>
              <th>Photo</th>
              <th>Student name</th>
              <th>Roll no.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>{row.file.name}</td>
                <td>
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updateRow(i, "name", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={row.rollNo}
                    placeholder="e.g. 14"
                    style={{ width: 80 }}
                    onChange={(e) => updateRow(i, "rollNo", e.target.value)}
                  />
                </td>
                <td>
                  <button type="button" className="link-btn" onClick={() => removeRow(i)}>
                    remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error && <p className="error">{error}</p>}

      <button type="button" onClick={handleSubmit} disabled={loading || !rows.length}>
        {loading ? "Scoring with Google Vision..." : `Score ${rows.length} student${rows.length === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}