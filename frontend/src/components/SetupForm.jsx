import { useState } from "react";
import { createAssignment } from "../api.js";

export default function SetupForm({ onCreated }) {
  const [topic, setTopic] = useState("");
  const [correctAnswerText, setCorrectAnswerText] = useState("");
  const [correctAnswerImage, setCorrectAnswerImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!correctAnswerText.trim() && !correctAnswerImage) {
      setError("Provide the correct answer as text, a photo, or both.");
      return;
    }
    setLoading(true);
    try {
      const assignment = await createAssignment({ topic, correctAnswerText, correctAnswerImage });
      onCreated(assignment);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>1. Set up the assignment</h2>

      <label>
        Topic
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Photosynthesis short-answer question"
          required
        />
      </label>

      <label>
        Correct answer (typed)
        <textarea
          rows={5}
          value={correctAnswerText}
          onChange={(e) => setCorrectAnswerText(e.target.value)}
          placeholder="Type or paste the model answer here..."
        />
      </label>

      <label>
        Or upload a photo of the correct answer instead
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setCorrectAnswerImage(e.target.files[0] || null)}
        />
      </label>
      <p className="hint">
        If you provide both, the typed text is used for scoring and the photo is OCR'd for reference.
      </p>

      {error && <p className="error">{error}</p>}

      <button type="submit" disabled={loading}>
        {loading ? "Creating..." : "Create assignment"}
      </button>
    </form>
  );
}
