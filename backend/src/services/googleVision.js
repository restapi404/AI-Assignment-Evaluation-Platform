// Google Cloud Vision: primary, synchronous OCR pass.
// Uses DOCUMENT_TEXT_DETECTION, which is the mode tuned for dense text /
// handwriting (vs TEXT_DETECTION, which is tuned for sparse text like signs).
// Docs: https://cloud.google.com/vision/docs/handwriting
//
// READING ORDER FIX: Vision's own `fullTextAnnotation.text` orders content
// by its internal block/column grouping. On ruled notebook pages with a
// vertical margin line, Vision sometimes misreads that margin as a column
// boundary and interleaves text in the wrong order (e.g. reading a phrase
// from partway down the page before finishing the sentence above it).
// To fix this, we ignore Vision's block grouping and instead pull every
// paragraph's bounding box, then sort all paragraphs purely by vertical
// position (top-to-bottom) - the correct assumption for a normal single-
// column handwritten answer sheet, even one with a margin line printed
// on it.

const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

function paragraphText(paragraph) {
  return (paragraph.words || [])
    .map((word) => (word.symbols || []).map((s) => s.text).join(""))
    .join(" ");
}

function paragraphCenter(paragraph) {
  const vertices = paragraph.boundingBox?.vertices || [];
  const ys = vertices.map((v) => v.y || 0);
  const xs = vertices.map((v) => v.x || 0);
  return {
    y: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0,
    x: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0,
  };
}

/** Reconstruct a page's text in strict top-to-bottom order, ignoring Vision's column grouping. */
function reconstructReadingOrder(page) {
  const paragraphs = [];
  for (const block of page.blocks || []) {
    for (const para of block.paragraphs || []) {
      const center = paragraphCenter(para);
      paragraphs.push({ text: paragraphText(para), ...center });
    }
  }
  paragraphs.sort((a, b) => a.y - b.y || a.x - b.x);
  return paragraphs.map((p) => p.text).join("\n");
}

/**
 * Run handwriting OCR on a single image buffer.
 * @param {Buffer} imageBuffer
 * @returns {Promise<{ text: string, confidence: number|null }>}
 */
export async function extractTextGoogle(imageBuffer) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_VISION_API_KEY is not set in backend/.env");
  }

  const body = {
    requests: [
      {
        image: { content: imageBuffer.toString("base64") },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints: ["en"] },
      },
    ],
  };

  const res = await fetch(`${VISION_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Vision API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const response = data.responses?.[0];

  if (response?.error) {
    throw new Error(`Google Vision API error: ${response.error.message}`);
  }

  const pages = response?.fullTextAnnotation?.pages;

  let text;
  if (pages?.length) {
    text = pages.map(reconstructReadingOrder).join("\n\n");
  } else {
    // Fallback: no structured page data, use Vision's raw text.
    text = response?.fullTextAnnotation?.text || "";
  }

  // Rough average confidence across detected pages, if present.
  let confidence = null;
  if (pages?.length) {
    const scores = pages
      .map((p) => p.confidence)
      .filter((c) => typeof c === "number");
    if (scores.length) {
      confidence = Math.round(
        (scores.reduce((a, b) => a + b, 0) / scores.length) * 1000
      ) / 10; // percentage, 1 decimal
    }
  }

  return { text: text.trim(), confidence };
}