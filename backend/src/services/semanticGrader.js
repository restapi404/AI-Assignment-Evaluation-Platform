// Semantic grading: judges whether a student's answer covers the same key
// points, facts, and conclusions as the correct answer - not whether it
// uses the same words. Uses Sarvam's chat completion endpoint.
// Docs: https://docs.sarvam.ai/api-reference-docs/chat/chat-completions
//
// IMPORTANT FIX: Sarvam's chat models have "thinking mode" on by default.
// With a small max_tokens, the model can burn its entire token budget on
// internal reasoning and return empty content (finish_reason: "length").
// We disable thinking mode explicitly (reasoning_effort: null) so the
// model answers directly - this is what was silently breaking grading
// before and causing a fallback to the plain word-match score.

const CHAT_ENDPOINT = "https://api.sarvam.ai/v1/chat/completions";

function buildPrompt(correctAnswer, studentAnswer) {
  return `You are a teacher grading a student's handwritten answer (extracted via OCR, so expect minor spelling/typo noise, and occasionally a line or phrase appearing out of order because handwritten notebook pages sometimes confuse OCR line-detection - reconstruct the most likely intended sentence/paragraph structure before judging, rather than penalizing apparent disorder that's probably an OCR artifact).

CORRECT / MODEL ANSWER:
"""
${correctAnswer}
"""

STUDENT'S ANSWER:
"""
${studentAnswer || "(no text was extracted from this student's photo - treat as blank/no answer)"}
"""

Grade this like a real teacher would, not a text-matching tool:
- Break the correct answer down into its key points, facts, terms, numbers, and conclusions.
- Check which of those key points the student's answer actually covers, in their own words.
- Do NOT penalize different phrasing, different word order, different sentence structure, synonyms, or OCR spelling/ordering noise.
- DO penalize: missing key points, factually wrong statements, or conclusions that contradict the correct answer.
- A student who covers all the key ideas in their own words should score as high as one who copied the correct answer verbatim.
- A student who is missing some key points but has no wrong information should get partial credit proportional to what's missing.
- A student who states something factually incorrect should be marked down even if they also covered other correct points.

Respond with ONLY a JSON object and nothing else - no markdown fences, no explanation outside the JSON:
{"accuracy": <integer 0-100>, "verdict": "<one of: correct, partially_correct, incorrect>", "covered_points": ["<key point the student got right>", ...], "missing_points": ["<key point the student missed or got wrong>", ...], "feedback": "<one short sentence summarizing why>"}`;
}

/** Pull the first {...} JSON object out of a string, even if the model added stray text around it. */
function extractJsonObject(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in model response");
  return JSON.parse(match[0]);
}

/**
 * @param {string} correctAnswer
 * @param {string} studentAnswer
 * @returns {Promise<{ accuracy: number, verdict: string, feedback: string, coveredPoints: string[], missingPoints: string[] }>}
 */
export async function gradeSemantically(correctAnswer, studentAnswer) {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new Error("SARVAM_API_KEY is not set in backend/.env");

  const res = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      "api-subscription-key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sarvam-30b",
      temperature: 0.2,
      max_tokens: 800,
      reasoning_effort: null, // disable thinking mode - see note at top of file
      messages: [{ role: "user", content: buildPrompt(correctAnswer, studentAnswer) }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Sarvam chat completion error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";

  if (!raw) {
    const finishReason = data.choices?.[0]?.finish_reason;
    throw new Error(
      `Sarvam chat completion returned empty content (finish_reason: ${finishReason || "unknown"})`
    );
  }

  let parsed;
  try {
    parsed = extractJsonObject(raw);
  } catch {
    throw new Error(`Could not parse semantic grading response as JSON: ${raw.slice(0, 300)}`);
  }

  return {
    accuracy: Math.max(0, Math.min(100, Number(parsed.accuracy) || 0)),
    verdict: parsed.verdict || "unknown",
    feedback: parsed.feedback || "",
    coveredPoints: Array.isArray(parsed.covered_points) ? parsed.covered_points : [],
    missingPoints: Array.isArray(parsed.missing_points) ? parsed.missing_points : [],
  };
}