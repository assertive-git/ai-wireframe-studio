# AI LP Wireframe Studio

A real Next.js MVP converted from the supplied HTML prototype.

## What is implemented

- Project dashboard and persistent project data
- New-project intake form
- Uploads for images, PDF, Excel, HTML/text files
- Automatic reference-URL screenshot capture + page text extraction
- Adaptive AI hearing flow using the OpenAI Responses API
- First-draft LP generation as editable HTML + CSS
- Live sandboxed iframe preview
- Click a generated section to target AI revisions
- Inline text editing in the preview
- Direct HTML/CSS editing with autosave
- AI differential revisions instead of regenerating everything
- Version history, manual snapshots, and restore
- Read-only share links
- ZIP export with `index.html` + `style.css`
- Single-user design: no account/login layer

## Stack

- Next.js App Router + TypeScript
- React
- Prisma + SQLite
- OpenAI Responses API
- Vercel Blob optionally for uploaded files
- Puppeteer Core + `@sparticuz/chromium` for reference-site screenshots

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment file:

```bash
cp .env.example .env.local
```

3. The default database setting is already suitable for local SQLite. Add your OpenAI key for real AI features:

```env
DATABASE_URL="file:./dev.db"
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-5.6"
BLOB_READ_WRITE_TOKEN=""
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

4. Create the SQLite database and tables:

```bash
npm run db:push
```

This creates `prisma/dev.db`.

5. Start the app:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Database

The app now uses a local SQLite file through Prisma. There is no PostgreSQL server to configure. The database lives at `prisma/dev.db` when using the default `DATABASE_URL="file:./dev.db"`.

The database file is excluded from Git by `.gitignore`. Back up `prisma/dev.db` if the project data matters.

Prisma's SQLite JSON support requires Prisma ORM 6.2 or newer, so this project requires `prisma` and `@prisma/client` `^6.2.0`.

## OpenAI

`OPENAI_API_KEY` enables:

- adaptive hearing questions
- generated first drafts
- targeted AI revisions
- image/PDF understanding when uploaded files are publicly reachable through Blob storage

If no OpenAI key is configured, the app uses a sample hearing/generation fallback so the complete UI can still be tested. AI revision deliberately returns an error instead of pretending an AI change occurred.

## Upload storage

When `BLOB_READ_WRITE_TOKEN` is configured, uploads and reference screenshots are stored in Vercel Blob.

Without the token, local development stores files under `public/uploads`.

## Reference URL capture

When a reference URL is added, `/api/reference` launches headless Chromium, captures a full-page screenshot, extracts visible page text, and saves both as an `Asset` attached to the project.

The route rejects obvious localhost/private-network URLs. Because URL screenshotting is a server-side browser feature, keep this app private or access-controlled even though it is designed for a single user.

## Deployment with SQLite

A local SQLite file needs a persistent writable filesystem. It works well locally and on a Node.js server/VPS with persistent storage.

Do **not** rely on `prisma/dev.db` for persistent data on a normal Vercel serverless deployment: the serverless filesystem is not a durable database. If you later want to deploy this app on Vercel while keeping SQLite semantics, switch the database layer to a hosted SQLite-compatible service such as Turso/libSQL.

Because this version intentionally has no login system, protect any internet-accessible deployment with an authentication/access-control layer.

## Generated LP format

The model is instructed to return:

- a body-only HTML fragment
- plain CSS
- stable `data-section-id` attributes on editable top-level sections
- no scripts or external JS
- unknown factual details as `要確認` instead of invented information

Generated HTML is additionally stripped of script tags and common inline JavaScript event handlers before being stored.

## Original prototype

The supplied HTML prototype is retained at:

`docs/original-prototype.html`
"# ai-wireframe-studio" 
