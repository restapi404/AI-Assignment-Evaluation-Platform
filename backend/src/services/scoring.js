// Turns (correctAnswerText, studentExtractedText) into an accuracy score
// and a word-level diff, similar in spirit to Word Error Rate (WER) used
// for grading speech transcripts in Reading Companion, but applied to
// handwriting OCR output instead.

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\w\s']/g, " ") // strip punctuation except apostrophes
    .replace(/\s+/g, " ")
    .trim();
}

function toWords(text) {
  const n = normalize(text);
  return n.length ? n.split(" ") : [];
}

// Classic Levenshtein edit distance with backtrace, generalized to work on
// arrays of tokens (words) or characters (pass a string split into chars).
function editDistanceWithOps(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrace to build an alignment (for diff highlighting)
  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: "match", correct: a[i - 1], student: b[j - 1] });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      ops.push({ type: "substitute", correct: a[i - 1], student: b[j - 1] });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ type: "missing", correct: a[i - 1], student: null });
      i--;
    } else {
      ops.push({ type: "extra", correct: null, student: b[j - 1] });
      j--;
    }
  }
  ops.reverse();

  return { distance: dp[n][m], ops };
}

/**
 * Score a student's OCR-extracted answer against the correct answer.
 * Returns a 0-100 accuracy plus a word-level diff for the UI.
 */
export function scoreAnswer(correctText, studentText) {
  const correctWords = toWords(correctText);
  const studentWords = toWords(studentText);

  if (correctWords.length === 0) {
    return {
      accuracy: null,
      wordAccuracy: null,
      charAccuracy: null,
      diff: [],
      note: "No correct answer text available to compare against.",
    };
  }

  const { distance: wordDistance, ops } = editDistanceWithOps(correctWords, studentWords);
  const wordAccuracy = Math.max(0, 1 - wordDistance / correctWords.length);

  const correctChars = normalize(correctText).replace(/ /g, "");
  const studentChars = normalize(studentText).replace(/ /g, "");
  const { distance: charDistance } = editDistanceWithOps(
    correctChars.split(""),
    studentChars.split("")
  );
  const charAccuracy =
    correctChars.length === 0 ? null : Math.max(0, 1 - charDistance / correctChars.length);

  // Blend: word accuracy is the primary, human-meaningful number;
  // char accuracy softens the penalty for near-miss OCR spelling errors.
  const blended =
    charAccuracy === null ? wordAccuracy : wordAccuracy * 0.7 + charAccuracy * 0.3;

  return {
    accuracy: Math.round(blended * 1000) / 10, // one decimal place, %
    wordAccuracy: Math.round(wordAccuracy * 1000) / 10,
    charAccuracy: charAccuracy === null ? null : Math.round(charAccuracy * 1000) / 10,
    diff: ops,
  };
}
