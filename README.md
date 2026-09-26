# Mysuru Heritage Desk

An automated news desk for **mysorepalace.com**. It pulls Mysuru news feeds, keeps only stories about Mysore Palace, the Wadiyar royal family's public role, Mysuru heritage and Dasara, and uses Claude to write original summaries. A human editor reviews every summary before it is published.

```
feeds ──► ingest ──► classify ──► cluster ──► summarize ──► stories (pending)
          (dedupe)   (Claude)     (48h, title  (Claude)          │
                     ≥ 0.6 kept    similarity)                   ▼
                                                  /admin review ─► published ─► /news, RSS, sitemap
```

## Layout

| Path | What it is |
| --- | --- |
| `supabase/migrations/` | Postgres schema: enums, tables, RLS |
| `packages/pipeline/src/` | `ingest`, `classify`, `cluster`, `summarize`, `digest`, `run` (orchestrator), `seed` |
| `packages/pipeline/prompts/` | `classify.md`, `summarize.md`: the system prompts, including the editorial rules |
| `packages/pipeline/sources.json` | Seed list of feeds |
| `packages/pipeline/fixtures/` | Offline feed and classification fixtures for tests and `--fixtures` runs |
| `apps/web/` | Next.js 15 site: landing page, `/news`, `/news/[slug]`, `/news/feed.xml`, `/sitemap.xml`, `/admin` |
| `.github/workflows/pipeline.yml` | Runs the pipeline every 6 hours (and the digest on Mondays) |
| `.github/workflows/ci.yml` | Typecheck, tests and build on every push |

## Setup

Requirements: Node 20+, pnpm 10, and a Supabase project.

```bash
pnpm install
cp .env.example .env         # fill in the values (one .env at the repo root, used by both packages)
```

| Variable | Used by | Notes |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | pipeline, `/admin` | The service role bypasses RLS. Keep it server-side only. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public pages | The anon key can read published stories only. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | pipeline | e.g. `claude-opus-5` |
| `ADMIN_PASSWORD` | `/admin` | HTTP Basic auth; any username works |
| `NEXT_PUBLIC_SITE_URL` | web, digest | Canonical URL for the sitemap, RSS and JSON-LD |

### Database

Apply the migration with the Supabase CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Or paste `supabase/migrations/20260926000000_init.sql` into the SQL editor.

**RLS:** RLS is on for every table. `anon` and `authenticated` get `SELECT` on `stories` where `status = 'published'`, and nothing else. The pipeline and the admin server actions use the service role.

## Running the pipeline locally

```bash
pnpm pipeline:seed                # insert sources from sources.json (safe to re-run)
pnpm pipeline:run                 # seed → ingest → classify → cluster → summarize
pnpm pipeline:run --fixtures      # same, but ingest reads fixtures/feeds.json (no feed fetching)
pnpm pipeline:digest              # compile last week's approved/published stories into a draft digest
```

You can also run a single step: `pnpm --filter pipeline ingest|classify|cluster|summarize`.

The `--fixtures` mode still writes to Supabase and calls Claude. Only feed fetching is replaced. Point it at a dev project.

**Re-runs are idempotent.** Each step only processes work that isn't done yet:

- **ingest:** skips any URL (canonicalised: no tracking params, no `www`, no fragment) or normalised title already stored.
- **classify:** only processes rows where `classified_at IS NULL`. Items the model skips, and batches that fail, are retried on the next run.
- **cluster:** only assigns items without a `cluster_key`. A new item can join a recent cluster and inherits its key.
- **summarize:** skips clusters that already have a story. If the story is still `pending` and new sources have joined, it is rewritten.

A failed step is logged, and the steps after it still run. The process exits non-zero, so the Actions run shows red.

### What the pipeline stores

- Only the feed **snippet**, capped at 500 characters. Full article text is never fetched or stored.
- Every relevance decision (`category`, `relevance`, `reason`) is kept on `raw_items`, so you can audit it. Items scoring below 0.6, and items marked `reject`, are never clustered or summarised.
- Summaries are checked mechanically for 150–250 words, 3–5 key facts, no run of 8+ words copied from a source, and no quote over 12 words. A summary that fails gets one retry with feedback. If it still fails, the problems are saved in `stories.review_notes` and shown to the editor in `/admin`.

## Reviewing and publishing

Open `/admin`. The browser asks for a password; use `ADMIN_PASSWORD` with any username.

- The tabs show `pending`, `approved`, `rejected` and `published` stories.
- You can edit every field inline. Each button saves your edits first and then applies its action.
- **Publish** sets `status = published`, `published_at = now()` and a slug (`headline-slug-<id prefix>`). The slug is kept if the story is re-published. The public pages, RSS and sitemap then revalidate.

## Adding a source

Add an entry to `packages/pipeline/sources.json`:

```json
{ "name": "Mysuru Mitra", "url": "https://example.com/feed", "type": "rss", "language": "kn" }
```

- `type`: `rss` for a direct RSS/Atom feed, `gnews` for a Google News RSS search URL, or `manual` (ingest skips it; insert its `raw_items` yourself).
- `language`: `en` or `kn`. Kannada items are classified as they are and translated during summarisation.
- `name` must be unique. The next `pipeline:run` (or `pipeline:seed`) inserts the new source. Existing sources are never overwritten, so to pause a source, set `active = false` in the `sources` table.

For a Google News query, use a URL like:
`https://news.google.com/rss/search?q=%22Chamundi+Hill%22&hl=en-IN&gl=IN&ceid=IN:en`

> **Check the seed URLs before production.** No live feeds were fetched while this project was scaffolded. Star of Mysore and The Hindu use their direct RSS feeds. Deccan Herald, Times of India, Prajavani and Vijaya Karnataka use Google News `site:` searches, because those outlets have no stable Mysuru-specific feed. Run one ingest against a dev database and replace any URL that returns nothing.

## Tests

```bash
pnpm test
```

The tests run offline against fixtures, with Claude mocked:

- `hash.test.ts`: URL canonicalisation, title normalisation (including Kannada), snippet capping, and dedupe. The Google News copy of a direct-feed story collapses to one item.
- `cluster.test.ts`: same-story grouping, the 48-hour window, stable keys across re-runs, and that existing clusters are never merged.
- `classify.test.ts`: a smoke test of the classify prompt and request with fixture items. It covers threshold filtering, unknown IDs the model returns, skipped items and refusals.
- `summarize.test.ts`: the mechanical rule checks (length, copied wording, long quotes).

## Deployment notes

- **Web:** deploy `apps/web` to any Next.js host (e.g. Vercel, root directory `apps/web`). Set the env vars there. `/admin` middleware runs on the Node.js runtime.
- **Cron:** add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` as repository **secrets**. Optionally set `ANTHROPIC_MODEL` and `NEXT_PUBLIC_SITE_URL` as repository **variables**. The workflow can also be run by hand, with an option to build the digest.

## Known limitations

- Clustering compares titles, so an English report and a Kannada report of the same event become separate clusters (and separate pending stories). The editor can reject the duplicate.
- Summaries are written from headlines and snippets only. The prompt allows well-established background but forbids invented specifics. The editor should check facts against the linked sources before publishing.
- Links from Google News items point to `news.google.com` redirects. The outlet name is kept in `raw_items.publisher`.
