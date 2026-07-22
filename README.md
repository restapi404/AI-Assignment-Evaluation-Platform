# AI Assignment Evaluation Platform

A full-stack internship project for handwritten assignment grading.

This repository includes:
- `backend/` — Express API for OCR, semantic grading, and Supabase storage
- `frontend/` — React + Vite UI for assignment creation, student uploads, and result review

## Features

- Upload up to 10 handwritten student answer images per assignment
- OCR via Google Cloud Vision
- Semantic grading via Sarvam AI (`sarvam-30b`)
- Accuracy score, verdict, and key-point coverage per student
- Assignment persistence in Supabase for later review

## Getting started

### 1. Prepare credentials

You need the following values:
- `APP_PASSWORD` — application login password
- `GOOGLE_VISION_API_KEY` — Google Cloud Vision API key
- `SARVAM_API_KEY` — Sarvam AI subscription key
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key

### 2. Backend setup

```bash
cd backend
npm install
cp .env.example .env
# edit .env and add APP_PASSWORD, GOOGLE_VISION_API_KEY, SARVAM_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm run dev
```

The backend starts on `http://localhost:4000`.

Verify with:

```bash
curl http://localhost:4000/api/health
```

### 3. Frontend setup

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies `/api` requests to the backend during development.

### 4. Use the app

1. Open `http://localhost:5173`
2. Log in with the app password
3. Create a new assignment with a topic and correct answer
4. Upload student handwritten answer photos
5. View results and accuracy scores

## Project structure

```
AI-Assignment-Evaluation-Platform/
  backend/     Express API, OCR, grading, Supabase storage
  frontend/    React + Vite UI
```

## Deployment notes

This project is not a single static site. The frontend depends on the backend API.

- For local development, run frontend and backend separately.
- If you deploy a static frontend without the backend, `/api/*` requests will return `404`.
- To deploy correctly, host the backend separately and build the frontend with the backend URL:

```bash
cd frontend
VITE_API_BASE=https://your-backend.example.com npm run build
```

## Screenshots (recommended)

Add screenshots to `README.md` if you cannot provide a live demo. Create a `screenshots/` folder and include at least:
- `screenshots/home.png`
- `screenshots/create-assignment.png`
- `screenshots/upload-students.png`
- `screenshots/results.png`

### Recommended screenshot flow

1. Home screen / login page
2. Create assignment page
3. Upload students page
4. Results page
5. Optional: assignment history page

Example screenshot section:

```markdown
## Screenshots

![Home screen](screenshots/home.png)

![Create assignment](screenshots/create-assignment.png)

![Upload students](screenshots/upload-students.png)

![Results view](screenshots/results.png)
```

## Notes

- Sarvam Vision OCR cross-check is currently disabled in `backend/src/routes/assignments.js`.
- The backend requires Supabase service role access for writes.
- The app uses a 10-photo batch limit to align with downstream processing constraints.

## Useful commands

```bash
# backend
cd backend
npm install
npm run dev

# frontend
cd frontend
npm install
npm run dev
```

## License

Add your preferred license information here.
