// Sarvam Vision Document Intelligence: async job-based OCR cross-check.
// Docs: https://docs.sarvam.ai/api-reference-docs/document-intelligence
//
// Flow: create job -> get presigned upload URL -> PUT the file -> start job
// -> poll status -> download output ZIP -> read per-page JSON.
//
// Endpoint details below were verified against a real working third-party
// integration (not just docs prose). One correction after live testing:
// the actual completion state string is "Completed" (not "Complete" as an
// earlier fix assumed from a blog post's prose) - confirmed directly from
// a real API response. The other fixes below still hold:
//   - output_format must be "html" or "md" - NOT "json" (confirmed directly
//     from the API's own validation error). The output ZIP always includes
//     JSON page data regardless of which of those two you choose, so our
//     JSON-parsing logic below still works.
//   - The download endpoint takes job_id in the URL path
//     (.../{job_id}/download-files), NOT in the request body.
//   - The upload-files response nests the presigned URL under "file_url"
//     (confirmed directly from a real response) - not "url" or similar.
//   - The presigned upload URL is an Azure Blob Storage SAS URL, which
//     requires an "x-ms-blob-type: BlockBlob" header on the PUT or Azure
//     rejects it with a 400.

import AdmZip from "adm-zip";
import archiver from "archiver";
import { PassThrough } from "node:stream";

const BASE = "https://api.sarvam.ai/doc-digitization/job/v1";

function authHeaders() {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new Error("SARVAM_API_KEY is not set in backend/.env");
  return { "api-subscription-key": key };
}

async function sarvamFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Sarvam API error ${res.status} on ${url}: ${errText}`);
  }
  return res;
}

/** Zip a set of { filename, buffer } images into one in-memory ZIP buffer. */
async function zipImages(files) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = new PassThrough();
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", reject);
    archive.pipe(stream);

    files.forEach(({ filename, buffer }) => archive.append(buffer, { name: filename }));
    archive.finalize();
  });
}

/**
 * Run a batch of up to 10 student photos through Sarvam Document
 * Intelligence in a single job, using filename ordering (01_, 02_, ...) to
 * map pages back to students.
 *
 * @param {{ filename: string, buffer: Buffer }[]} files - filenames should
 *   sort in the order you want pages processed, e.g. "01_ravi.jpg".
 * @returns {Promise<Map<string, string>>} filename -> extracted text
 */
export async function extractTextBatchSarvam(files, { language = "en-IN" } = {}) {
  if (!files.length) return new Map();

  // 1. Create job
  const createRes = await sarvamFetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_parameters: { language, output_format: "md" },
    }),
  });
  const { job_id: jobId } = await createRes.json();

  // 2. Build a single ZIP of all pages and request an upload URL for it
  const zipBuffer = await zipImages(files);
  const zipFilename = "batch.zip";

  const uploadUrlsRes = await sarvamFetch(`${BASE}/upload-files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id: jobId, files: [zipFilename] }),
  });
  const uploadData = await uploadUrlsRes.json();
  const uploadEntry = uploadData.upload_urls?.[zipFilename];
  const uploadUrl =
    typeof uploadEntry === "string"
      ? uploadEntry
      : uploadEntry?.file_url || uploadEntry?.url || uploadEntry?.upload_url || uploadEntry?.signed_url || uploadEntry?.presigned_url;

  if (!uploadUrl) {
    throw new Error(
      `Sarvam upload-files response didn't match any expected shape for "${zipFilename}". ` +
        `Raw entry: ${JSON.stringify(uploadEntry)}`
    );
  }

  // 3. Upload the ZIP to the presigned URL. This is an Azure Blob Storage SAS
  // URL (blob.core.windows.net) - Azure's Blob PUT API requires the
  // x-ms-blob-type header or it rejects the request with a 400, even though
  // nothing else about the request is wrong.
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": "application/zip" },
    body: zipBuffer,
  });
  if (!putRes.ok) {
    const putErrText = await putRes.text().catch(() => "");
    throw new Error(`Failed to upload batch ZIP to Sarvam presigned URL (${putRes.status}): ${putErrText}`);
  }

  // 4. Start the job
  await sarvamFetch(`${BASE}/${jobId}/start`, { method: "POST" });

  // 5. Poll status until Complete / Failed / timeout.
  // PartComplete means some pages succeeded and some failed - we still try
  // to use whatever came back rather than discarding the whole batch.
  const timeoutMs = Number(process.env.SARVAM_POLL_TIMEOUT_MS || 120000);
  const intervalMs = Number(process.env.SARVAM_POLL_INTERVAL_MS || 3000);
  const start = Date.now();
  let status = "Pending";

  while (Date.now() - start < timeoutMs) {
    const statusRes = await sarvamFetch(`${BASE}/${jobId}/status`);
    const statusData = await statusRes.json();
    status = statusData.job_state || statusData.status;
    if (status === "Completed" || status === "Complete" || status === "PartComplete") break;
    if (status === "Failed") {
      throw new Error(`Sarvam job ${jobId} failed (all pages failed or job-level error)`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  if (status !== "Completed" && status !== "Complete" && status !== "PartComplete") {
    throw new Error(`Sarvam job ${jobId} did not complete within ${timeoutMs}ms (last status: ${status})`);
  }

  // 6. Get a download URL for the output ZIP, fetch it, and read per-page JSON.
  // job_id goes in the URL here, not the request body.
  const downloadRes = await sarvamFetch(`${BASE}/${jobId}/download-files`, { method: "POST" });
  const downloadData = await downloadRes.json();

  // The exact response shape isn't fully pinned down from public docs, so
  // try the field names that show up in similar Sarvam job endpoints before
  // giving up with a clear, debuggable error instead of a silent wrong guess.
  const outputUrl =
    downloadData.file_url ||
    downloadData.output_url ||
    downloadData.download_url ||
    downloadData.url ||
    downloadData.download_urls?.output ||
    downloadData.files?.[0]?.file_url ||
    (typeof Object.values(downloadData.download_urls || {})[0] === "string"
      ? Object.values(downloadData.download_urls || {})[0]
      : Object.values(downloadData.download_urls || {})[0]?.file_url || Object.values(downloadData.download_urls || {})[0]?.url);

  if (!outputUrl) {
    throw new Error(
      `Sarvam download-files response didn't match any expected shape. Raw keys: ${Object.keys(downloadData).join(", ")}`
    );
  }

  const outputZipRes = await fetch(outputUrl);
  const outputZipBuffer = Buffer.from(await outputZipRes.arrayBuffer());
  const zip = new AdmZip(outputZipBuffer);

  // Map original page order (by sorted filename) back to each input file.
  // JSON page data is always included in the output ZIP regardless of the
  // requested output_format, so this parsing logic holds either way.
  const sortedInputNames = files.map((f) => f.filename).sort();
  const jsonEntries = zip
    .getEntries()
    .filter((e) => e.entryName.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));

  const results = new Map();
  jsonEntries.forEach((entry, idx) => {
    const pageData = JSON.parse(entry.getData().toString("utf-8"));
    const pageText = Array.isArray(pageData.blocks)
      ? pageData.blocks.map((b) => b.text).join("\n")
      : pageData.text || "";
    const originalFilename = sortedInputNames[idx];
    if (originalFilename) results.set(originalFilename, pageText.trim());
  });

  return results;
}