-- Mysuru Heritage Desk — initial schema
-- Pipeline writes with the service role (bypasses RLS).
-- The public site reads with the anon key and may only see published stories.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type source_type as enum ('rss', 'gnews', 'manual');
create type story_category as enum ('palace', 'royal_family', 'heritage', 'dasara', 'city', 'reject');
create type story_status as enum ('pending', 'approved', 'rejected', 'published');
create type digest_status as enum ('draft', 'approved', 'published');

-- ---------------------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------------------
create table sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  url         text not null,
  type        source_type not null,
  language    text not null default 'en',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- raw_items — one row per fetched feed entry. Snippet only (<= 500 chars),
-- never full article text.
-- ---------------------------------------------------------------------------
create table raw_items (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references sources(id) on delete cascade,
  external_id    text not null unique,          -- sha256 of canonical URL
  title          text not null,
  url            text not null,
  published_at   timestamptz,
  snippet        text check (char_length(snippet) <= 500),
  fetched_at     timestamptz not null default now(),
  hash           text not null,                 -- sha256 of normalised title
  publisher      text,                          -- original outlet (Google News items carry this)

  -- pipeline state (makes re-runs idempotent)
  category       story_category,
  relevance      real check (relevance between 0 and 1),
  reason         text,
  classified_at  timestamptz,
  cluster_key    text
);

create index raw_items_hash_idx on raw_items (hash);
create index raw_items_unclassified_idx on raw_items (fetched_at) where classified_at is null;
create index raw_items_cluster_idx on raw_items (cluster_key);

-- ---------------------------------------------------------------------------
-- stories — one per cluster, human-reviewed before publishing
-- ---------------------------------------------------------------------------
create table stories (
  id              uuid primary key default gen_random_uuid(),
  cluster_key     text not null unique,
  category        story_category not null,
  headline        text not null,
  summary_md      text not null,
  why_it_matters  text,
  key_facts       jsonb not null default '[]'::jsonb,
  source_urls     text[] not null default '{}',
  status          story_status not null default 'pending',
  created_at      timestamptz not null default now(),
  published_at    timestamptz,
  slug            text unique,
  review_notes    text,                          -- pipeline flags for the editor (rule checks, source conflicts)
  constraint published_has_slug check (status <> 'published' or (slug is not null and published_at is not null))
);

create index stories_status_idx on stories (status, created_at desc);
create index stories_published_idx on stories (published_at desc) where status = 'published';

-- ---------------------------------------------------------------------------
-- digests — weekly roll-ups of approved/published stories
-- ---------------------------------------------------------------------------
create table digests (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null unique,
  body_md     text not null,
  status      digest_status not null default 'draft',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- service_role bypasses RLS, so the pipeline and admin server actions need no
-- policies. anon/authenticated get read access to published stories only.
-- ---------------------------------------------------------------------------
alter table sources   enable row level security;
alter table raw_items enable row level security;
alter table stories   enable row level security;
alter table digests   enable row level security;

revoke all on sources, raw_items, stories, digests from anon, authenticated;
grant select on stories to anon, authenticated;

create policy "public can read published stories"
  on stories for select
  to anon, authenticated
  using (status = 'published');
