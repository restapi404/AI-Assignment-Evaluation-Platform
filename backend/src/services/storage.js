// Handles the actual student scan photos in Supabase Storage. Images are
// kept (not just OCR'd and discarded) so they can be viewed later. The
// bucket is private, so reads go through short-lived signed URLs rather
// than public links.

import { supabase } from "./db.js";

const BUCKET = "student-scans";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export async function uploadStudentImage(assignmentId, filename, buffer, contentType) {
  const path = `${assignmentId}/${filename}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: true });

  if (error) throw new Error(`Failed to upload image: ${error.message}`);
  return path;
}

/** @param {string[]} paths @returns {Promise<Map<string, string>>} path -> signed URL (missing entries on error) */
export async function getSignedUrls(paths) {
  const cleanPaths = paths.filter(Boolean);
  if (!cleanPaths.length) return new Map();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(cleanPaths, SIGNED_URL_TTL_SECONDS);

  if (error) throw new Error(`Failed to sign image URLs: ${error.message}`);

  const map = new Map();
  data.forEach((entry) => {
    if (entry.signedUrl) map.set(entry.path, entry.signedUrl);
  });
  return map;
}

export async function removeImages(paths) {
  const cleanPaths = paths.filter(Boolean);
  if (!cleanPaths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(cleanPaths);
  if (error) throw new Error(`Failed to delete image(s): ${error.message}`);
}