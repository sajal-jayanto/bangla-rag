# Bangla RAG

A retrieval-augmented generation (RAG) API for Bangla documents. Upload a scanned PDF or an image to a project, and the service reads it with OCR, splits the text into chunks, embeds them with Gemini and stores them in PostgreSQL + pgvector. You can then ask questions in Bangla and get answers drawn **only** from your own documents — or **`জানা নেই`** ("not known") when they don't contain the answer.

Built with **Express 5**, **TypeScript**, **PostgreSQL 17 + pgvector**, **Tesseract OCR** and the **Google Gen AI SDK** (Gemini).

## Contents

- [How it works](#how-it-works)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Walkthrough](#walkthrough)
- [API reference](#api-reference)
- [Database](#database)
- [Project structure](#project-structure)
- [Scripts](#scripts)
- [Testing and CI](#testing-and-ci)
- [License](#license)

## How it works

```
 Upload (PDF / PNG / JPG, ≤ 5 MB)                      Question ("পদ্মা সেতুর দৈর্ঘ্য কত?")
          │                                                        │
          ▼                                                        ▼
 Tesseract OCR (Bangla + English)                       Gemini embedding of the question
  PDFs: up to 20 pages at 300 DPI                                  │
          │                                                        ▼
          ▼                                             pgvector: nearest chunks in the project
 Split into ~1000-char chunks per page                   (cosine similarity ≥ 0.6)
          │                                                        │
          ▼                                              none ─────┴───── some
 Gemini embeddings (768 dims)                             │                 │
          │                                               ▼                 ▼
          ▼                                          "জানা নেই"     Gemini answers from those
 PostgreSQL: document metadata + chunks                             chunks only (or "জানা নেই")
 (the uploaded file itself is never stored)
```

## Features

- **Accounts** — register and log in with bcrypt-hashed passwords and HS256 JWTs.
- **Projects** — create, list, update and soft-delete projects; each user only sees their own. Slugs are generated from the name and keep Bangla text (`আমার প্রকল্প` → `আমার-প্রকল্প`).
- **OCR upload** — PDF, PNG and JPG up to 5 MB, read with Tesseract in Bangla and English. The file type is checked from its content, not its name. The file is held in memory only and never saved.
- **Chunking and embeddings** — text is split page by page at sentence ends (including `।`) with overlap, embedded with `gemini-embedding-001` and stored with a vector index.
- **Document metadata** — name, type, size, SHA-256, page counts, PDF properties (title, author, …), OCR status and timing, chunk count. Failed uploads are recorded too.
- **Question answering** — semantic search over a project's chunks, answered by Gemini using only the retrieved text, with the sources returned alongside. Replies `জানা নেই` when nothing relevant is found.
- **Operations** — SQL migrations applied on startup, Zod request validation, Helmet, CORS, structured logging with Pino, graceful shutdown, Docker image with OCR tools included.

## Tech stack

| Area       | Tools                                                        |
| ---------- | ------------------------------------------------------------ |
| Runtime    | Node.js 24, Express 5, TypeScript (ESM)                      |
| Database   | PostgreSQL 17, pgvector (HNSW cosine index), `pg`            |
| OCR        | Tesseract 5 (`ben` + `eng`), Poppler (`pdfinfo`, `pdftoppm`) |
| AI         | `@google/genai` — `gemini-embedding-001`, `gemini-3.5-flash` |
| Auth       | jsonwebtoken, bcryptjs                                       |
| Uploads    | multer (in-memory)                                           |
| Validation | Zod                                                          |
| Tooling    | tsx, ESLint, Prettier, node:test, Docker Compose             |

## Getting started

### Requirements

- **Docker** with Docker Compose — enough to run everything.
- To run the API outside Docker: **Node.js 24+**, plus Tesseract and Poppler:

  ```bash
  sudo apt install tesseract-ocr tesseract-ocr-ben tesseract-ocr-eng poppler-utils   # Debian / Ubuntu
  tesseract --list-langs   # should list ben and eng
  ```

- A **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey) for uploads and search.

### 1. Configure

```bash
cp .env.example .env
```

Set at least `POSTGRES_PASSWORD` (and the same password in `DATABASE_URL`), `JWT_SECRET` and `GEMINI_API_KEY`. Generate a JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`.env` is git-ignored; never commit real keys.

### 2a. Run everything in Docker

```bash
docker compose up -d --build
```

The API is at <http://localhost:3000> — check it with `curl localhost:3000/health`. The image includes Tesseract (Bangla + English) and Poppler.

### 2b. Or run the database in Docker and the API locally

```bash
npm install
docker compose up -d db
npm run dev
```

Postgres is bound to `127.0.0.1` only, and its data lives in the `pg-data` volume. Migrations run automatically when the API starts.

### 3. Optional: sample data

```bash
npm run seed
```

Creates a demo user **`demo@example.com` / `password123`** with sample projects. Safe to run more than once; refuses to run when `NODE_ENV=production`.

## Configuration

| Variable                 | Required         | Default                | Description                                                                          |
| ------------------------ | ---------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| `PORT`                   | no               | `3000`                 | Port the API listens on                                                              |
| `NODE_ENV`               | no               | `development`          | `development` adds stack traces to error responses and logs OCR at debug level       |
| `DATABASE_URL`           | **yes**          | —                      | Postgres connection string (Docker Compose builds its own for the `api` service)     |
| `POSTGRES_USER`          | Docker           | `bangla_rag`           | User for the Postgres container                                                      |
| `POSTGRES_PASSWORD`      | Docker           | —                      | Password for the Postgres container                                                  |
| `POSTGRES_DB`            | Docker           | `bangla_rag`           | Database name                                                                        |
| `POSTGRES_PORT`          | no               | `5432`                 | Host port for the Postgres container                                                 |
| `GEMINI_API_KEY`         | uploads & search | —                      | Gemini API key. Without it the API still starts, but uploads and search return `503` |
| `GEMINI_EMBEDDING_MODEL` | no               | `gemini-embedding-001` | Embedding model (must produce 768-dimension vectors)                                 |
| `GEMINI_CHAT_MODEL`      | no               | `gemini-3.5-flash`     | Model that writes search answers                                                     |
| `SEARCH_MIN_SIMILARITY`  | no               | `0.6`                  | Cosine similarity (0–1) a chunk needs to count as related to a question              |
| `JWT_SECRET`             | **yes**          | —                      | Token signing secret, **at least 32 characters**                                     |
| `JWT_EXPIRES_IN`         | no               | `1h`                   | Token lifetime, e.g. `15m`, `1h`, `7d`                                               |

## Walkthrough

```bash
API=http://localhost:3000/api

# 1. Register (or log in) and keep the token
TOKEN=$(curl -s -X POST $API/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Rahim","email":"rahim@example.com","password":"a-strong-password"}' | jq -r .token)

# 2. Create a project
curl -s -X POST $API/projects -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"বাংলা নথি","priority":"high"}'
# → { "project": { "id": "1", "slug": "বাংলা-নথি", ... } }

# 3. Upload a scanned PDF or image to it
curl -s -X POST $API/projects/1/ocr -H "Authorization: Bearer $TOKEN" -F "file=@scan.pdf"

# 4. Ask a question
curl -s -X POST $API/projects/1/search -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"পদ্মা সেতুর দৈর্ঘ্য কত?"}'
```

## API reference

All `/api` routes except `/api/auth/*` need an `Authorization: Bearer <token>` header. Request and response bodies are JSON unless noted.

| Method | Path                          | Description                                           |
| ------ | ----------------------------- | ----------------------------------------------------- |
| GET    | `/health`                     | Liveness check                                        |
| POST   | `/api/auth/register`          | Create an account → user + token                      |
| POST   | `/api/auth/login`             | Log in → user + token                                 |
| GET    | `/api/users/me`               | The current user                                      |
| GET    | `/api/dashboard`              | The current user plus Postgres and pgvector versions  |
| GET    | `/api/projects`               | Your projects, newest first                           |
| POST   | `/api/projects`               | Create a project                                      |
| GET    | `/api/projects/:id`           | One of your projects                                  |
| PATCH  | `/api/projects/:id`           | Update a project                                      |
| DELETE | `/api/projects/:id`           | Soft-delete a project                                 |
| POST   | `/api/projects/:id/ocr`       | Upload a PDF or image: OCR, chunk, embed and save     |
| GET    | `/api/projects/:id/documents` | Metadata of the files uploaded to a project           |
| POST   | `/api/projects/:id/search`    | Ask a question; answered from the project's documents |

### Auth

`POST /api/auth/register` — `{ "name", "email", "password" }`

- `name` 1–100 characters; `email` valid, stored lower-case; `password` 8+ characters and at most 72 bytes.
- `201` → `{ "user": { "id", "name", "email", "role" }, "token" }`. `409` if the email is already registered.

`POST /api/auth/login` — `{ "email", "password" }`

- `200` → same shape as register. `404` if no account has that email, `401` if the password is wrong.

### Projects

| Field         | Values                                        | Default    |
| ------------- | --------------------------------------------- | ---------- |
| `name`        | 1–150 characters                              | required   |
| `description` | up to 5000 characters, or `null`              | `null`     |
| `status`      | `planning`, `active`, `completed`, `archived` | `planning` |
| `priority`    | `low`, `mid`, `high`                          | `mid`      |

```json
{
  "project": {
    "id": "5",
    "ownerId": "5",
    "name": "Bangla News Search",
    "slug": "bangla-news-search",
    "description": "Semantic search over Bangla news articles.",
    "status": "active",
    "priority": "high",
    "createdAt": "2026-11-16T07:47:18.120Z"
  }
}
```

- **Create** (`201`) and **update** (`200`) accept only `name`, `description`, `status` and `priority`; any other field (such as `slug` or `ownerId`) is rejected with `400`. On update, send just the fields to change.
- **Slug** — generated from the name on create, gets a `-2`, `-3`, … suffix if you already use it, and stays the same when the project is renamed.
- **Delete** (`204`) is a soft delete: the project disappears from every endpoint, its slug can be reused, and the data stays in the database.
- Another user's project, or a deleted one, returns `404`.

### Upload a document — `POST /api/projects/:id/ocr`

`multipart/form-data` with one file in the field **`file`**.

```bash
curl -X POST http://localhost:3000/api/projects/5/ocr \
  -H "Authorization: Bearer $TOKEN" -F "file=@scan.pdf"
```

`201` with the processing result — the document's metadata, **not** its text:

```json
{
  "document": {
    "id": "10",
    "projectId": "5",
    "uploadedBy": "5",
    "fileName": "scan.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 27261,
    "sha256": "85bd5dee25e993ac9a9e1a20868d3a7dbbdde4324f6536e98ec7efaf73f4a073",
    "kind": "pdf",
    "pageCount": 2,
    "pagesProcessed": 2,
    "textLength": 81,
    "pdfInfo": {
      "producer": "GPL Ghostscript 10.06.0",
      "pdfVersion": "1.7",
      "pageSize": "595 x 842 pts (A4)",
      "encrypted": "no"
    },
    "ocrStatus": "completed",
    "ocrError": null,
    "ocrDurationMs": 1291,
    "chunkCount": 2,
    "embeddingModel": "gemini-embedding-001"
  },
  "truncated": false
}
```

- **Accepted:** PDF, PNG and JPG/JPEG only, up to **5 MB**. The content is checked, so a renamed file is rejected.
- **PDFs** are OCR'd up to the first **20 pages** at 300 DPI; `truncated` is `true` when the PDF had more.
- **Chunks** are up to ~1000 characters with 150 characters of overlap, split page by page at paragraph and sentence ends (`।`, `.`, `?`, `!`). Each chunk keeps its page number.
- **`pdfInfo`** holds the PDF's own properties when set (title, subject, author, creator, producer, creation and modification dates, page size, PDF version, encrypted); `null` for images.
- **Storage:** the file is never written anywhere. The metadata and the chunks (text + embedding) are saved in one transaction.
- **Failures:** if OCR or embedding fails, the document is still recorded with `ocrStatus: "failed"`, the reason in `ocrError` and no chunks. Uploads rejected up front (`404`, `413`, `415`) are not recorded.

| Status | When                                                                |
| ------ | ------------------------------------------------------------------- |
| `400`  | No file, or not sent in the `file` field                            |
| `404`  | The project isn't yours or is deleted                               |
| `413`  | The file is larger than 5 MB                                        |
| `415`  | Not a PDF, PNG or JPG                                               |
| `422`  | The file can't be read (corrupt or encrypted PDF)                   |
| `502`  | The Gemini embedding request failed                                 |
| `503`  | Tesseract or Poppler isn't installed, or `GEMINI_API_KEY` isn't set |

`GET /api/projects/:id/documents` → `{ "documents": [ ... ] }`, newest first, each in the shape above.

### Search — `POST /api/projects/:id/search`

| Field   | Values                          | Default  |
| ------- | ------------------------------- | -------- |
| `query` | the question, 1–1000 characters | required |
| `limit` | 1–20                            | `5`      |

```bash
curl -X POST http://localhost:3000/api/projects/5/search \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "query": "পদ্মা সেতুর দৈর্ঘ্য কত?" }'
```

```json
{
  "query": "পদ্মা সেতুর দৈর্ঘ্য কত?",
  "found": true,
  "answer": "৬.১৫ কিলোমিটার।",
  "sources": [
    {
      "documentId": "13",
      "fileName": "dhaka.png",
      "pageNumber": null,
      "chunkIndex": 0,
      "similarity": 0.6589,
      "content": "ঢাকা বাংলাদেশের রাজধানী এবং সবচেয়ে বড় শহর। ..."
    }
  ]
}
```

1. The question is embedded with Gemini.
2. The `limit` nearest chunks in the project are fetched by cosine similarity, and those below `SEARCH_MIN_SIMILARITY` (0.6) are dropped. `limit` is an upper bound: you may get fewer sources.
3. If no chunk is left, the answer is **`জানা নেই`** and Gemini is not called.
4. Otherwise Gemini answers in Bangla using **only** those chunks, and replies `জানা নেই` if they don't contain the answer.

When the answer is `জানা নেই`, `found` is `false` and `sources` is empty:

```json
{ "query": "ঢাকার জনসংখ্যা কত?", "found": false, "answer": "জানা নেই", "sources": [] }
```

`404` for a project that isn't yours; `502` if a Gemini request fails; `504` if Gemini takes longer than 30 seconds.

### Errors

Errors share one shape; `details` appears on validation errors, and `stack` only when `NODE_ENV=development`.

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "details": { "query": ["Query is required"] }
}
```

## Database

| Table               | Contents                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `users`             | Accounts; unique case-insensitive email; `user` / `admin` role                                                                     |
| `projects`          | Owned by a user; `slug` unique per owner among non-deleted projects; soft-deleted with `is_deleted`                                |
| `documents`         | Metadata of each uploaded file (see [Upload a document](#upload-a-document--post-apiprojectsidocr)); the file itself is not stored |
| `chunks`            | OCR text chunks with page number and a `vector(768)` embedding; HNSW `vector_cosine_ops` index                                     |
| `schema_migrations` | Ids of applied migrations                                                                                                          |

Deleting a user removes their projects; deleting a project row removes its documents and chunks.

### Migrations

Migrations are plain SQL files in [migrations/](migrations/), applied in filename order. Each runs in its own transaction and its name is recorded in `schema_migrations`, so it runs only once. They run automatically when the API starts, or with `npm run migrate`.

To change the schema:

```bash
npm run migrate:create -- add_tags   # creates migrations/006_add_tags.sql
# write the SQL in that file
npm run migrate
```

Never edit a migration that has already run — add a new one instead.

## Project structure

```
migrations/            SQL migrations (001_init.sql, 002_create_projects.sql, ...)
src/
  app.ts               Express app: middleware and routes
  server.ts            Starts the server, runs migrations, handles shutdown
  config/              Environment variables and logger
  db/                  Connection pool, migration runner, migrate:create, seed
  routes/              Route definitions (api.routes.ts, health.routes.ts)
  middlewares/         Auth, validation, uploads, errors, logging
  controllers/         HTTP layer: read the request, call a service, send the response
  services/            Business logic: auth, projects, OCR, embeddings, documents, search, answers
  repositories/        SQL queries
  models/              Row and API types, and the mapping between them
  validators/          Zod request schemas
  utils/               Slugs, text chunking, router groups
```

Requests flow **route → middleware → controller → service → repository**. Tests (`*.test.ts`) sit next to the services they cover.

## Scripts

| Script                             | Description                                               |
| ---------------------------------- | --------------------------------------------------------- |
| `npm run dev`                      | Start with hot reload (tsx watch)                         |
| `npm run build`                    | Compile TypeScript to `dist/`                             |
| `npm start`                        | Run the compiled build                                    |
| `npm run typecheck`                | Type-check without emitting                               |
| `npm run migrate`                  | Apply pending migrations and exit                         |
| `npm run migrate:create -- <name>` | Create the next numbered `migrations/NNN_<name>.sql`      |
| `npm run seed`                     | Add the demo user and sample projects (not in production) |
| `npm test`                         | Run the unit tests (node:test)                            |
| `npm run lint` / `lint:fix`        | ESLint                                                    |
| `npm run format` / `format:check`  | Prettier                                                  |

## Testing and CI

```bash
npm test
```

Unit tests use `node:test` with in-memory fakes, so they need no database, Tesseract or Gemini key. GitHub Actions ([.github/workflows](.github/workflows)) runs lint, the Prettier check and the tests on every push and pull request to `master`.

## License

[MIT](LICENSE)
