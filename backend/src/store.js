// Persistent store backed by Supabase Postgres + Storage. Run
// backend/supabase-schema.sql once in your Supabase project before using this.

import { supabase } from "./services/db.js";
import { getSignedUrls, removeImages } from "./services/storage.js";

function mapStudentRow(s) {
  return {
    id: s.id,
    name: s.name,
    rollNo: s.roll_no,
    rosterId: s.roster_id,
    filename: s.filename,
    imagePath: s.image_path,
    imageUrl: null, // filled in by attachImageUrls()
    googleText: s.google_text,
    googleConfidence: s.google_confidence,
    sarvamText: s.sarvam_text,
    sarvamStatus: s.sarvam_status,
    score: s.score,
    textSimilarity: s.text_similarity,
    sarvamScore: s.sarvam_score,
    createdAt: s.created_at,
  };
}

function mapRosterRow(r) {
  return {
    id: r.id,
    name: r.name,
    rollNo: r.roll_no,
    createdAt: r.created_at,
  };
}

function mapAssignmentRow(a, students = []) {
  return {
    id: a.id,
    topic: a.topic,
    correctAnswerText: a.correct_answer_text,
    correctAnswerImageOcr: a.correct_answer_image_ocr,
    createdAt: a.created_at,
    students: students.map(mapStudentRow),
  };
}

/** Mutates students in place, adding a signed imageUrl where an imagePath exists. */
async function attachImageUrls(students) {
  const paths = students.map((s) => s.imagePath).filter(Boolean);
  if (!paths.length) return students;
  const urlMap = await getSignedUrls(paths);
  students.forEach((s) => {
    if (s.imagePath) s.imageUrl = urlMap.get(s.imagePath) || null;
  });
  return students;
}

export async function createAssignment({ topic, correctAnswerText, correctAnswerImageOcr }) {
  const { data, error } = await supabase
    .from("assignments")
    .insert({
      topic,
      correct_answer_text: correctAnswerText,
      correct_answer_image_ocr: correctAnswerImageOcr,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create assignment: ${error.message}`);
  const assignment = mapAssignmentRow(data, []);
  await logEvent(assignment.id, "assignment_created", { topic: assignment.topic });
  return assignment;
}

export async function listAssignments() {
  const { data, error } = await supabase
    .from("assignments")
    .select("id, topic, created_at, students(count)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list assignments: ${error.message}`);

  return data.map((a) => ({
    id: a.id,
    topic: a.topic,
    createdAt: a.created_at,
    studentCount: a.students?.[0]?.count ?? 0,
  }));
}

export async function getAssignment(id) {
  const { data: assignment, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load assignment: ${error.message}`);
  if (!assignment) return null;

  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("*")
    .eq("assignment_id", id)
    .order("created_at", { ascending: true });

  if (studentsError) throw new Error(`Failed to load students: ${studentsError.message}`);

  const mapped = mapAssignmentRow(assignment, students || []);
  await attachImageUrls(mapped.students);
  return mapped;
}

/** Update an assignment's topic and/or correct answer. Pass only the fields you want to change. */
export async function updateAssignment(id, { topic, correctAnswerText }) {
  const patch = {};
  if (topic !== undefined) patch.topic = topic;
  if (correctAnswerText !== undefined) patch.correct_answer_text = correctAnswerText;

  const { data, error } = await supabase
    .from("assignments")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update assignment: ${error.message}`);

  await logEvent(id, "assignment_updated", {
    topic: data.topic,
    updatedFields: Object.keys(patch).map((k) => (k === "correct_answer_text" ? "correctAnswerText" : k)),
  });

  return mapAssignmentRow(data, []);
}

export async function deleteAssignment(id) {
  const { data: assignment } = await supabase.from("assignments").select("topic").eq("id", id).maybeSingle();
  const topic = assignment?.topic || "(unknown)";

  const { data: students } = await supabase.from("students").select("image_path").eq("assignment_id", id);
  const imagePaths = (students || []).map((s) => s.image_path).filter(Boolean);

  // Log BEFORE deleting - the FK is ON DELETE SET NULL, so this row survives
  // the cascade (with assignment_id nulled out) and keeps the topic snapshot.
  await logEvent(id, "assignment_deleted", { topic });

  if (imagePaths.length) await removeImages(imagePaths);

  const { error } = await supabase.from("assignments").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete assignment: ${error.message}`);
}

/**
 * Match a submission to a persistent student identity by exact (name, roll
 * no) match, creating one if it doesn't exist yet. This is what lets a
 * student's history span multiple assignments - a different spelling of
 * their name, or a missing/different roll no, will NOT be matched to the
 * same roster entry (matches the exact-match rule as specified).
 */
async function getOrCreateRosterEntry(name, rollNo) {
  const cleanName = name.trim();
  const cleanRollNo = rollNo.trim();

  const { data, error } = await supabase
    .from("roster")
    .upsert({ name: cleanName, roll_no: cleanRollNo }, { onConflict: "name,roll_no", ignoreDuplicates: false })
    .select()
    .single();

  if (error) throw new Error(`Failed to resolve roster entry: ${error.message}`);
  return data.id;
}

/** Insert a batch of scored students for an assignment. Returns the inserted rows (with DB-assigned ids, no image URLs attached). */
export async function addStudents(assignmentId, students) {
  const rows = [];
  for (const s of students) {
    const rosterId = await getOrCreateRosterEntry(s.name, s.rollNo);
    rows.push({
      assignment_id: assignmentId,
      roster_id: rosterId,
      name: s.name,
      roll_no: s.rollNo,
      filename: s.filename,
      image_path: s.imagePath,
      google_text: s.googleText,
      google_confidence: s.googleConfidence,
      sarvam_text: s.sarvamText,
      sarvam_status: s.sarvamStatus,
      score: s.score,
      text_similarity: s.textSimilarity,
    });
  }

  const { data, error } = await supabase.from("students").insert(rows).select();
  if (error) throw new Error(`Failed to save students: ${error.message}`);

  const mapped = data.map(mapStudentRow);
  await attachImageUrls(mapped);
  return mapped;
}

export async function deleteStudent(studentId) {
  const { data: student, error: fetchError } = await supabase
    .from("students")
    .select("name, image_path, assignment_id, assignments(topic)")
    .eq("id", studentId)
    .maybeSingle();

  if (fetchError) throw new Error(`Failed to look up student: ${fetchError.message}`);
  if (!student) return;

  if (student.image_path) await removeImages([student.image_path]);

  const { error } = await supabase.from("students").delete().eq("id", studentId);
  if (error) throw new Error(`Failed to delete student: ${error.message}`);

  await logEvent(student.assignment_id, "student_deleted", {
    topic: student.assignments?.topic || "(unknown)",
    studentName: student.name,
  });
}

/** Overwrite a student's headline score + text-similarity detail, e.g. after re-grading. */
export async function updateStudentScore(studentId, { score, textSimilarity }) {
  const { error } = await supabase
    .from("students")
    .update({ score, text_similarity: textSimilarity })
    .eq("id", studentId);

  if (error) throw new Error(`Failed to update student score: ${error.message}`);
}

/** For the (currently disabled) Sarvam cross-check to fill in results later. */
export async function updateStudentSarvam(studentId, { sarvamText, sarvamStatus, sarvamScore }) {
  const { error } = await supabase
    .from("students")
    .update({ sarvam_text: sarvamText, sarvam_status: sarvamStatus, sarvam_score: sarvamScore })
    .eq("id", studentId);

  if (error) throw new Error(`Failed to update student: ${error.message}`);
}

export async function logEvent(assignmentId, eventType, details) {
  const { error } = await supabase
    .from("activity_log")
    .insert({ assignment_id: assignmentId, event_type: eventType, details });
  if (error) console.error(`Failed to log activity event "${eventType}":`, error.message);
}

export async function listActivity(limit = 100) {
  const { data, error } = await supabase
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load activity log: ${error.message}`);

  return data.map((e) => ({
    id: e.id,
    assignmentId: e.assignment_id,
    eventType: e.event_type,
    details: e.details,
    createdAt: e.created_at,
  }));
}

/** Every unique student (by name + roll no), with how many submissions they have. */
export async function listRoster() {
  const { data, error } = await supabase
    .from("roster")
    .select("id, name, roll_no, created_at, students(count)")
    .order("name", { ascending: true });

  if (error) throw new Error(`Failed to load roster: ${error.message}`);

  return data.map((r) => ({
    ...mapRosterRow(r),
    submissionCount: r.students?.[0]?.count ?? 0,
  }));
}

/** One student's full cross-assignment history: their roster info + every submission they've made, newest first. */
export async function getRosterStudent(id) {
  const { data: roster, error: rosterError } = await supabase
    .from("roster")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (rosterError) throw new Error(`Failed to load student: ${rosterError.message}`);
  if (!roster) return null;

  const { data: submissions, error: submissionsError } = await supabase
    .from("students")
    .select("*, assignments(id, topic)")
    .eq("roster_id", id)
    .order("created_at", { ascending: false });

  if (submissionsError) throw new Error(`Failed to load submissions: ${submissionsError.message}`);

  const mappedSubmissions = (submissions || []).map((s) => ({
    ...mapStudentRow(s),
    assignmentId: s.assignments?.id || null,
    assignmentTopic: s.assignments?.topic || "(deleted assignment)",
  }));
  await attachImageUrls(mappedSubmissions);

  return { ...mapRosterRow(roster), submissions: mappedSubmissions };
}