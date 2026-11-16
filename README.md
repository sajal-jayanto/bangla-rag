# Bangla RAG

A starter for a Bangla retrieval-augmented generation service, built with **Express 5**, **TypeScript**, **PostgreSQL + pgvector** and **JWT** authentication. It ships with registration, login and a dashboard endpoint, with the `vector` extension enabled for the RAG schema to come.

## Features

- Register / login with bcrypt-hashed passwords and HS256 JWTs
- Dashboard API: current user plus Postgres / pgvector versions
- PostgreSQL 17 with the `vector` extension enabled
- Schema migrations run automatically on startup (or with `npm run migrate`)
- Request validation with Zod, security headers (Helmet), CORS, structured logging (Pino)
- Graceful shutdown on `SIGINT` / `SIGTERM`

## Tech stack

| Area       | Tools                                 |
| ---------- | ------------------------------------- |
| Runtime    | Node.js, Express 5, TypeScript (ESM)  |
| Database   | PostgreSQL 17, pgvector, `pg`         |
| Auth       | jsonwebtoken, bcryptjs                |
| Validation | Zod                                   |
| Tooling    | tsx, ESLint, Prettier, Docker Compose |

## Getting started

### 1. Install dependencies

```bash
npm install
```

To run the API outside Docker you also need Tesseract (with Bangla and English) and Poppler for OCR. The Docker image already includes them.

```bash
sudo apt install tesseract-ocr tesseract-ocr-ben tesseract-ocr-eng poppler-utils   # Debian / Ubuntu
tesseract --list-langs   # should list ben and eng
```

### 2. Configure the environment

```bash
cp .env.example .env
```

| Variable                 | Required    | Default                | Description                                                               |
| ------------------------ | ----------- | ---------------------- | ------------------------------------------------------------------------- |
| `PORT`                   | no          | `3000`                 | Port the API listens on                                                   |
| `NODE_ENV`               | no          | `development`          | `development` includes stack traces in errors                             |
| `DATABASE_URL`           | **yes**     | —                      | Postgres connection string (used by `npm run dev`)                        |
| `POSTGRES_USER`          | Docker      | `bangla_rag`           | User for the Docker Postgres container                                    |
| `POSTGRES_PASSWORD`      | Docker      | —                      | Password for the Docker Postgres container                                |
| `POSTGRES_DB`            | Docker      | `bangla_rag`           | Database name                                                             |
| `POSTGRES_PORT`          | no          | `5432`                 | Host port for the Docker Postgres container                               |
| `GEMINI_API_KEY`         | for uploads | —                      | Gemini API key used to embed OCR text (uploads return `503` without it)   |
| `GEMINI_EMBEDDING_MODEL` | no          | `gemini-embedding-001` | Gemini embedding model                                                    |
| `GEMINI_CHAT_MODEL`      | no          | `gemini-3.5-flash`     | Gemini model that writes search answers                                   |
| `SEARCH_MIN_SIMILARITY`  | no          | `0.6`                  | Cosine similarity (0–1) a chunk needs to count as related to the question |
| `JWT_SECRET`             | **yes**     | —                      | Signing secret, **at least 32 characters**                                |
| `JWT_EXPIRES_IN`         | no          | `1h`                   | Token lifetime (e.g. `15m`, `1h`, `7d`)                                   |

Generate a strong secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3a. Run everything in Docker

```bash
docker compose up -d --build
```

The API is available at <http://localhost:3000> (try `GET /health`).

### 3b. Or run only the database in Docker and the API locally

```bash
docker compose up -d db
npm run dev
```

Postgres is bound to `127.0.0.1` only and its data lives in the `pg-data` volume.

## API

| Method | Path                          | Auth | Description                                                        |
| ------ | ----------------------------- | ---- | ------------------------------------------------------------------ |
| GET    | `/health`                     | —    | Liveness check                                                     |
| POST   | `/api/auth/register`          | —    | `{ name, email, password }` → user + token                         |
| POST   | `/api/auth/login`             | —    | `{ email, password }` → user + token                               |
| GET    | `/api/users/me`               | JWT  | Current user                                                       |
| GET    | `/api/dashboard`              | JWT  | User and DB info                                                   |
| GET    | `/api/projects`               | JWT  | Your projects, newest first                                        |
| POST   | `/api/projects`               | JWT  | Create a project                                                   |
| GET    | `/api/projects/:id`           | JWT  | One of your projects                                               |
| PATCH  | `/api/projects/:id`           | JWT  | Update a project                                                   |
| DELETE | `/api/projects/:id`           | JWT  | Soft-delete a project (`204`)                                      |
| POST   | `/api/projects/:id/ocr`       | JWT  | OCR + embed a PDF or image, returns metadata                       |
| GET    | `/api/projects/:id/documents` | JWT  | Metadata of files uploaded to the project                          |
| POST   | `/api/projects/:id/search`    | JWT  | Ask a question; answers from the project's documents or `জানা নেই` |

Authenticated routes expect an `Authorization: Bearer <token>` header.

### Projects

Create and update accept only `name`, `description`, `status` and `priority`; any other field is rejected with `400`. On update, send just the fields to change.

| Field         | Values                                        | Default    |
| ------------- | --------------------------------------------- | ---------- |
| `name`        | 1–150 characters                              | required   |
| `description` | up to 5000 characters, or `null`              | `null`     |
| `status`      | `planning`, `active`, `completed`, `archived` | `planning` |
| `priority`    | `low`, `mid`, `high`                          | `mid`      |

The `slug` is generated from the name on create (Bangla text is kept, e.g. `আমার-প্রকল্প`), gets a `-2`, `-3`, … suffix if you already have that slug, and does not change when the project is renamed. `ownerId` is the signed-in user. Deleting sets `is_deleted = true`; deleted projects no longer appear in any endpoint and their slug can be reused. Other users' projects return `404`.

### OCR

`POST /api/projects/:id/ocr` takes `multipart/form-data` with one file in the field `file`. The server:

1. OCRs it with Tesseract (Bangla + English);
2. splits the text into chunks of up to ~1000 characters (150 overlap), page by page, breaking at sentence ends (`।`, `.`, `?`, `!`) where possible;
3. embeds each chunk with Gemini (`gemini-embedding-001`, 768 dimensions, `RETRIEVAL_DOCUMENT`);
4. saves the document metadata and the chunks (text, page number, embedding) in one transaction.

It answers `201` with the processing result (the document metadata), **not** the text. The uploaded file itself is held in memory only and never stored.

```bash
curl -X POST http://localhost:3000/api/projects/5/ocr \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@scan.pdf"
```

```json
{
  "document": {
    "id": "2",
    "projectId": "5",
    "uploadedBy": "5",
    "fileName": "scan.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 27261,
    "sha256": "85bd5dee…",
    "kind": "pdf",
    "pageCount": 2,
    "pagesProcessed": 2,
    "textLength": 81,
    "pdfInfo": {
      "producer": "GPL Ghostscript 10.06.0",
      "pdfVersion": "1.7",
      "pageSize": "595 x 842 pts (A4)"
    },
    "ocrStatus": "completed",
    "ocrError": null,
    "ocrDurationMs": 1291,
    "chunkCount": 2,
    "embeddingModel": "gemini-embedding-001",
    "createdAt": "2026-11-16T08:43:03.583Z"
  },
  "truncated": false
}
```

- Accepted: **PDF, PNG and JPG/JPEG** only; the file content is checked, not just the extension or type (`415` otherwise).
- Max **5 MB** (`413` if larger). PDFs are OCR'd up to the first 20 pages at 300 DPI; `truncated` is `true` when there were more.
- The project must be one of yours and not deleted (`404` otherwise).
- `503` if `tesseract` or Poppler is not installed, or `GEMINI_API_KEY` is not set; `502` if the Gemini API call fails; `422` if the file can't be read (corrupt or encrypted PDF). A failed OCR or embedding is still recorded (with no chunks), with `ocrStatus: "failed"` and the reason in `ocrError`; rejected uploads (`413`, `415`, `404`) are not.
- `pdfInfo` holds the PDF's own properties when set (title, subject, author, creator, producer, creation/modification date, page size, PDF version, encrypted). It is `null` for images.
- Bangla file names are kept as-is.

### Search

`POST /api/projects/:id/search` answers a question (Bangla or English) from the documents uploaded to that project.

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
      "content": "..."
    }
  ]
}
```

1. The question is embedded with Gemini (`QUESTION_ANSWERING`, 768 dimensions).
2. The project's `limit` (default 5, max 20) nearest chunks are found by cosine similarity; those below `SEARCH_MIN_SIMILARITY` (0.6) are dropped.
3. If none are left, the answer is **`জানা নেই`** ("not known") and Gemini is not called.
4. Otherwise Gemini answers using **only** those chunks, in Bangla, and replies `জানা নেই` if they don't contain the answer.

When the answer is `জানা নেই`, `found` is `false` and `sources` is empty. `404` for a project that isn't yours; `502` / `504` if Gemini fails or takes over 30 s.

## Database schema

- `users` — accounts, unique case-insensitive email, `user` / `admin` role
- `projects` — owned by a user; `slug` unique per owner among non-deleted projects; soft-deleted via the `is_deleted` boolean
- `documents` — metadata of each file uploaded to a project (name, type, size, SHA-256, pages, text length, PDF properties, OCR status and duration, chunk count, embedding model); the file itself is not stored
- `chunks` — OCR text chunks of a document with page number and a `vector(768)` Gemini embedding, HNSW cosine index
- `schema_migrations` — applied migration ids

Migrations are plain SQL files in [migrations/](migrations/), applied in filename order by [src/db/migrate.ts](src/db/migrate.ts). Each file runs in its own transaction and its name (without `.sql`) is recorded in `schema_migrations`. To change the schema, run `npm run migrate:create -- add_tags` (creates e.g. `002_add_tags.sql`), write the SQL, then `npm run migrate`; never edit one that has already run.

## Scripts

| Script                             | Description                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`                      | Start with hot reload (tsx watch)                                                   |
| `npm run build`                    | Compile TypeScript to `dist/`                                                       |
| `npm start`                        | Run the compiled build                                                              |
| `npm run migrate`                  | Apply pending migrations and exit                                                   |
| `npm run migrate:create -- <name>` | Create the next numbered `migrations/NNN_<name>.sql`                                |
| `npm run seed`                     | Add a demo user (`demo@example.com` / `password123`) and sample projects (dev only) |
| `npm test`                         | Run unit tests (node:test)                                                          |
| `npm run lint`                     | ESLint                                                                              |
| `npm run format:check`             | Prettier check                                                                      |

## License

[MIT](LICENSE)
