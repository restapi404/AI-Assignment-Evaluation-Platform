const BASE = import.meta.env.VITE_API_BASE || "/api";

async function handle(res, fallbackError) {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || fallbackError);
  return res.json();
}

// --- Auth -----------------------------------------------------------------

export async function login(password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ password }),
  });
  return handle(res, "Login failed");
}

export async function logout() {
  await fetch(`${BASE}/auth/logout`, { method: "POST", credentials: "include" });
}

export async function checkAuth() {
  const res = await fetch(`${BASE}/auth/me`, { credentials: "include" });
  if (!res.ok) return { loggedIn: false };
  return res.json();
}

// --- Assignments ------------------------------------------------------------

export async function listAssignments() {
  const res = await fetch(`${BASE}/assignments`, { credentials: "include" });
  return handle(res, "Failed to load assignments");
}

export async function createAssignment({ topic, correctAnswerText, correctAnswerImage }) {
  const form = new FormData();
  form.append("topic", topic);
  if (correctAnswerText) form.append("correctAnswerText", correctAnswerText);
  if (correctAnswerImage) form.append("correctAnswerImage", correctAnswerImage);

  const res = await fetch(`${BASE}/assignments`, { method: "POST", credentials: "include", body: form });
  return handle(res, "Failed to create assignment");
}

export async function getAssignment(id) {
  const res = await fetch(`${BASE}/assignments/${id}`, { credentials: "include" });
  return handle(res, "Failed to load assignment");
}

export async function updateAssignment(id, { topic, correctAnswerText }) {
  const res = await fetch(`${BASE}/assignments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ topic, correctAnswerText }),
  });
  return handle(res, "Failed to update assignment");
}

export async function deleteAssignment(id) {
  const res = await fetch(`${BASE}/assignments/${id}`, { method: "DELETE", credentials: "include" });
  return handle(res, "Failed to delete assignment");
}

export async function regradeAssignment(id) {
  const res = await fetch(`${BASE}/assignments/${id}/regrade`, { method: "POST", credentials: "include" });
  return handle(res, "Failed to re-grade assignment");
}

// --- Students -----------------------------------------------------------

export async function uploadStudents(assignmentId, { photos, names, rollNos }) {
  const form = new FormData();
  photos.forEach((file) => form.append("photos", file));
  form.append("names", JSON.stringify(names));
  form.append("rollNos", JSON.stringify(rollNos));

  const res = await fetch(`${BASE}/assignments/${assignmentId}/students`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  return handle(res, "Failed to upload students");
}

export async function deleteStudent(assignmentId, studentId) {
  const res = await fetch(`${BASE}/assignments/${assignmentId}/students/${studentId}`, {
    method: "DELETE",
    credentials: "include",
  });
  return handle(res, "Failed to delete student");
}

// --- Roster (cross-assignment student identities) ---------------------------

export async function listRoster() {
  const res = await fetch(`${BASE}/roster`, { credentials: "include" });
  return handle(res, "Failed to load roster");
}

export async function getRosterStudent(id) {
  const res = await fetch(`${BASE}/roster/${id}`, { credentials: "include" });
  return handle(res, "Failed to load student");
}

// --- Activity log ---------------------------------------------------------

export async function listActivity() {
  const res = await fetch(`${BASE}/activity`, { credentials: "include" });
  return handle(res, "Failed to load activity log");
}