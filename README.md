# Handwriting Accuracy Checker

An internship tool: upload up to 10 students' photographed handwritten answers
for one assignment topic, run handwriting recognition on them, and get an
accuracy score for each student against a correct answer — graded on meaning
and key-point coverage, not exact wording.

## How it works

1. **Set up the assignment** — enter a topic and the correct answer, either
   typed or as a photo (which gets OCR'd too).
2. **Upload up to 10 student scans** — one photo per student. Each is OCR'd
   via **Google Cloud Vision** (`DOCUMENT_TEXT_DETECTION`), with a custom
   reading-order fix so text reconstructs top-to-bottom correctly even on
   notebook pages with a printed margin rule.
3. **Grading** — the extracted text is graded by an LLM (Sarvam's
   `sarvam-30b` chat model) that breaks the correct answer into key
   points/facts/conclusions and checks which ones the student covered, in
   their own words. It does not penalize different phrasing or OCR spelling
   noise — only missing or factually wrong content.
4. **Results** — each student gets an accuracy %, a verdict (correct /
   partially correct / incorrect), which key points were covered vs missed,
   and (for reference) a literal word-level text-similarity diff too.
5. **Assignments persist** in Supabase, so past batches are browsable from
   the home screen after a restart.

Sarvam's Vision OCR cross-check (a separate, async job-based path) is
currently disabled — see the note in `backend/src/routes/assignments.js` for
how to re-enable it.

## Project layout

```
handwriting-accuracy-checker/
  backend/     Express API — OCR, grading, Supabase-backed storage
  frontend/    React + Vite UI
```

## Setup

### 1. Get your credentials

- **Google Cloud Vision**: enable the Vision API on a GCP project (with billing enabled) and create an API key at https://console.cloud.google.com/apis/credentials
- **Sarvam AI**: sign up and get a subscription key at https://dashboard.sarvam.ai
- **Supabase**: create a project at https://supabase.com, then:
  1. Go to the SQL Editor and run everything in `backend/supabase-schema.sql` once, to create the `assignments` and `students` tables.
  2. Go to Project Settings → API and copy the **Project URL** and the **`service_role` key** (not the `anon` key — the backend needs to bypass Row Level Security since it's the only thing talking to the database).

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# edit .env: APP_PASSWORD, GOOGLE_VISION_API_KEY, SARVAM_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm run dev
```

Backend runs on `http://localhost:4000`.

Check `http://localhost:4000/api/health` to confirm the backend is reachable and your keys are loaded.

### 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` and proxies `/api` calls to `http://localhost:4000` when developing locally.

Open `http://localhost:5173` in your browser and log in with the app password. Then create a new assignment, upload student photos, and view the graded results.

### 4. GitHub / live demo notes

- If you upload this repo to GitHub as a static site (for example using GitHub Pages), the backend will not be available there and `/api/*` calls will return `404`.
- To avoid `REST API 404` in a deployed frontend, either:
  - host the backend separately and set `VITE_API_BASE` to the backend URL before building, or
  - keep the project as a code-only repo and include screenshots instead of a live demo.
- Example frontend build configuration for a hosted backend:

```bash
cd frontend
VITE_API_BASE=https://your-backend.example.com npm run build
```

### 5. Screenshots for GitHub presentation

If you cannot provide a live demo, add screenshots to the `README` and include a `screenshots/` folder in the repo.

Recommended flow for screenshots:
1. Home screen / login page: show the app landing page after login, so reviewers see the app is working and authenticated.
2. Create assignment: show the form where the user enters the topic and correct answer, including the photo upload step if possible.
3. Upload students: show the student upload interface with photo inputs or the completed upload step.
4. Results view: show final graded output, accuracy scores, and any verdict or key-point coverage details.
5. History/assignment list (optional): show that saved assignments persist and can be browsed later.

Create a `screenshots/` folder and add at least:
- `screenshots/home.png`
- `screenshots/create-assignment.png`
- `screenshots/upload-students.png`
- `screenshots/results.png`

Then add a section like this:

## Screenshots

![Home screen](screenshots/home.png)

![Create assignment](screenshots/create-assignment.png)

![Upload students](screenshots/upload-students.png)

![Results view](screenshots/results.png)

## When there is no live demo

This repository contains the full frontend and backend code for the handwriting accuracy checker, but the hosted demo is unavailable because the backend must run separately from the static frontend. You can run it locally using the steps above.

## Notes / things to know

- **Sarvam Vision OCR cross-check is commented out**, not deleted — see the
  disabled-block comments in `backend/src/routes/assignments.js` and
  `backend/src/services/sarvamVision.js`. It had an `output_format` bug
  (`"json"` isn't valid — Sarvam only accepts `"html"` or `"md"`) that's
  noted inline if you want to fix and re-enable it.
- **Semantic grading requires `reasoning_effort: null`** in the Sarvam chat
  completion request — Sarvam's models have "thinking mode" on by default,
  which can silently eat the whole token budget and return empty content if
  left on. This is already handled in `semanticGrader.js`, just noting it in
  case you tweak that file.
- **10-photo batch limit** is intentional: it matches Sarvam's 10-page limit
  per Document Intelligence job (relevant again if the OCR cross-check gets
  re-enabled).
- To deploy this later (e.g. to the same EC2 box as Reading Companion), the
  backend needs `.env` values set as real environment variables and a
  process manager (PM2); the frontend gets built with `npm run build` and
  served via Nginx.