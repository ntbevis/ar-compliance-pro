# Compliance Guard Pro

Compliance tracking and readiness platform for Arkansas childcare centers and
long-term care (nursing home) facilities. The app combines **facility-level
operations** (staffing/enrollment ratios, blueprints, document center) with a
**Personnel Vault** that maps each employee's role to its Arkansas regulatory
requirements and tracks verification status.

Built with Next.js (App Router) + Supabase (Postgres, Auth, Storage) and an
AI-assisted document verification flow.

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, React 19) |
| Styling | Tailwind CSS v4 |
| Backend / DB | Supabase (Postgres 17, Auth, Storage, RLS) |
| AI | `ai` SDK + `@ai-sdk/openai` for document verification |
| PDF | `jspdf` + `jspdf-autotable` |
| Validation | `zod` |

## Prerequisites

- Node.js 20+
- A Supabase project (see env vars below)

## Environment variables

Create `.env.local` in this directory (never commit it — it is gitignored):

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # server-only, bypasses RLS — never expose to client
OPENAI_API_KEY=...                   # used by document verification
```

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (CI should be 0 errors) |

## Architecture notes

- **Server actions** (`src/app/actions/*`) use the Supabase **service-role**
  client and enforce `org_id` ownership in code. This is the primary data path.
- **Row Level Security** isolates tenants at the database layer as defense in
  depth. Browser (anon/authenticated key) access is limited to document
  uploads scoped to the caller's own organization. See the
  `*_rls_tenant_isolation` and `*_perf_indexes_and_rls_initplan` migrations.
- **Proxy** (`src/proxy.ts`, formerly `middleware.ts`) guards `/dashboard`,
  `/onboarding`, and `/admin`, and enforces the onboarding-completion flow.

## Database

Migrations live in [`supabase/migrations`](./supabase/migrations) and should be
applied in filename (timestamp) order. See
[supabase/README.md](./supabase/README.md) for details and verification
queries. After any DDL change, re-run the Supabase security + performance
advisors and resolve new findings.

## Production deploy

See **[DEPLOY.md](./DEPLOY.md)** for the full pre/post-deploy checklist.

Regulatory PDFs and ingest notes: [regulatory-docs/README.md](./regulatory-docs/README.md).
