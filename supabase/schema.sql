-- Inspiration Archive — database setup
--
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- It is safe to run again: every statement checks whether its object exists.
--
-- The shape of it: five tables, each one owned by a single signed-in user, with
-- row level security turned on so the database itself refuses to hand anyone
-- another person's rows. Screenshots live in a private storage bucket under a
-- folder named after the owner.

-- ---------------------------------------------------------------- extensions

-- gen_random_uuid() comes from here, and is used for every primary key.
create extension if not exists pgcrypto;

-- -------------------------------------------------------------------- tables

-- One saved website. The colours, fonts and tags live here rather than on the
-- individual shots, because they describe the site as a whole.
create table if not exists public.sites (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null default 'Untitled',
  url             text,
  source_url      text,
  case_study_url  text,
  -- Where it was found. Keep in step with the Source type in lib/types.ts.
  source          text not null default 'Other'
                  check (source in ('Awwwards','Dribbble','Godly','Land-book','Behance','Other')),
  designer        text,
  -- Keep in step with the Industry type in lib/types.ts.
  industry        text not null default 'other'
                  check (industry in ('hotel','restaurant','interior-design','architecture',
                                      'clinic','salon-beauty','agency-studio','portfolio',
                                      'ecommerce','other')),
  -- Free tags such as "minimal" or "horizontal scroll".
  styles          text[] not null default '{}',
  -- { heading, body, headingPreview, bodyPreview }
  fonts           jsonb not null default '{}'::jsonb,
  -- Up to eight hex codes, most used first.
  colors          text[] not null default '{}',
  -- { background, text, accent } — only the roles picked by hand are stored.
  color_roles     jsonb not null default '{}'::jsonb,
  notes           text not null default '',
  favorite        boolean not null default false,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One screenshot of one section. section is null when the shot is unsorted.
-- image_path points into the screenshots bucket and is null until a picture is
-- attached, which is what the app reads as "hasImage".
create table if not exists public.shots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  site_id     uuid not null references public.sites (id) on delete cascade,
  -- Keep in step with the Section type in lib/types.ts. Null means Unsorted.
  section     text check (section in ('hero','navigation','about','services','rooms','projects',
                                      'gallery','team','testimonials','pricing','booking',
                                      'contact','footer','loading','error-404','full-page','other')),
  device      text not null default 'desktop' check (device in ('desktop','mobile')),
  image_path  text,
  width       integer,
  height      integer,
  -- The colours pulled out of this screenshot.
  colors      text[] not null default '{}',
  note        text not null default '',
  created_at  timestamptz not null default now()
);

-- A named group of shots.
create table if not exists public.collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default 'Untitled collection',
  created_at  timestamptz not null default now()
);

-- Which shots are in which collection, and in what order. position is what the
-- drag-to-reorder on the collection page writes.
create table if not exists public.collection_shots (
  collection_id  uuid not null references public.collections (id) on delete cascade,
  shot_id        uuid not null references public.shots (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position       integer not null default 0,
  created_at     timestamptz not null default now(),
  primary key (collection_id, shot_id)
);

-- A share link for one collection. There is deliberately no policy letting the
-- public read this table: a visitor with a link never touches it directly. The
-- server route at /share/[token] looks the token up with the secret key and
-- hands back only that collection's name and shots.
create table if not exists public.collection_shares (
  token          text primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection_id  uuid not null references public.collections (id) on delete cascade,
  revoked        boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ------------------------------------------------------------------ indexes

-- Every query starts by narrowing to the signed-in owner, so each table is
-- indexed on user_id. The rest match how the library actually filters.
create index if not exists sites_user_id_idx            on public.sites (user_id);
create index if not exists sites_industry_idx           on public.sites (user_id, industry);
create index if not exists sites_created_at_idx         on public.sites (user_id, created_at desc);
create index if not exists shots_user_id_idx            on public.shots (user_id);
create index if not exists shots_site_id_idx            on public.shots (site_id);
create index if not exists shots_section_idx            on public.shots (user_id, section);
create index if not exists shots_created_at_idx         on public.shots (user_id, created_at desc);
create index if not exists collections_user_id_idx      on public.collections (user_id);
create index if not exists collection_shots_user_id_idx on public.collection_shots (user_id);
create index if not exists collection_shots_order_idx   on public.collection_shots (collection_id, position);
create index if not exists collection_shots_shot_idx    on public.collection_shots (shot_id);
create index if not exists collection_shares_user_id_idx    on public.collection_shares (user_id);
create index if not exists collection_shares_collection_idx on public.collection_shares (collection_id);

-- --------------------------------------------------------------- updated_at

-- Keeps sites.updated_at honest without the app having to remember.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sites_touch_updated_at on public.sites;
create trigger sites_touch_updated_at
  before update on public.sites
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------- row level security

-- With this on, the table returns nothing at all unless a policy below says
-- otherwise. This is the wall; the policies are the one door through it.
alter table public.sites             enable row level security;
alter table public.shots             enable row level security;
alter table public.collections       enable row level security;
alter table public.collection_shots  enable row level security;
alter table public.collection_shares enable row level security;

-- Four policies per table, all saying the same thing: a signed-in person may
-- touch a row only when that row's user_id is their own id. auth.uid() comes
-- from the request's own access token, so it cannot be faked from the browser.

-- sites
drop policy if exists "sites are readable by their owner"   on public.sites;
drop policy if exists "sites are insertable by their owner" on public.sites;
drop policy if exists "sites are updatable by their owner"  on public.sites;
drop policy if exists "sites are deletable by their owner"  on public.sites;
create policy "sites are readable by their owner"   on public.sites for select to authenticated using (auth.uid() = user_id);
create policy "sites are insertable by their owner" on public.sites for insert to authenticated with check (auth.uid() = user_id);
create policy "sites are updatable by their owner"  on public.sites for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sites are deletable by their owner"  on public.sites for delete to authenticated using (auth.uid() = user_id);

-- shots
drop policy if exists "shots are readable by their owner"   on public.shots;
drop policy if exists "shots are insertable by their owner" on public.shots;
drop policy if exists "shots are updatable by their owner"  on public.shots;
drop policy if exists "shots are deletable by their owner"  on public.shots;
create policy "shots are readable by their owner"   on public.shots for select to authenticated using (auth.uid() = user_id);
create policy "shots are insertable by their owner" on public.shots for insert to authenticated with check (auth.uid() = user_id);
create policy "shots are updatable by their owner"  on public.shots for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "shots are deletable by their owner"  on public.shots for delete to authenticated using (auth.uid() = user_id);

-- collections
drop policy if exists "collections are readable by their owner"   on public.collections;
drop policy if exists "collections are insertable by their owner" on public.collections;
drop policy if exists "collections are updatable by their owner"  on public.collections;
drop policy if exists "collections are deletable by their owner"  on public.collections;
create policy "collections are readable by their owner"   on public.collections for select to authenticated using (auth.uid() = user_id);
create policy "collections are insertable by their owner" on public.collections for insert to authenticated with check (auth.uid() = user_id);
create policy "collections are updatable by their owner"  on public.collections for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "collections are deletable by their owner"  on public.collections for delete to authenticated using (auth.uid() = user_id);

-- collection_shots
drop policy if exists "collection shots are readable by their owner"   on public.collection_shots;
drop policy if exists "collection shots are insertable by their owner" on public.collection_shots;
drop policy if exists "collection shots are updatable by their owner"  on public.collection_shots;
drop policy if exists "collection shots are deletable by their owner"  on public.collection_shots;
create policy "collection shots are readable by their owner"   on public.collection_shots for select to authenticated using (auth.uid() = user_id);
create policy "collection shots are insertable by their owner" on public.collection_shots for insert to authenticated with check (auth.uid() = user_id);
create policy "collection shots are updatable by their owner"  on public.collection_shots for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "collection shots are deletable by their owner"  on public.collection_shots for delete to authenticated using (auth.uid() = user_id);

-- collection_shares — owner only. No policy grants the public anything here.
drop policy if exists "shares are readable by their owner"   on public.collection_shares;
drop policy if exists "shares are insertable by their owner" on public.collection_shares;
drop policy if exists "shares are updatable by their owner"  on public.collection_shares;
drop policy if exists "shares are deletable by their owner"  on public.collection_shares;
create policy "shares are readable by their owner"   on public.collection_shares for select to authenticated using (auth.uid() = user_id);
create policy "shares are insertable by their owner" on public.collection_shares for insert to authenticated with check (auth.uid() = user_id);
create policy "shares are updatable by their owner"  on public.collection_shares for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "shares are deletable by their owner"  on public.collection_shares for delete to authenticated using (auth.uid() = user_id);

-- ------------------------------------------------------------------ storage

-- A private bucket for the screenshots. public = false means no URL reaches a
-- file directly; the app asks for a short-lived signed URL each time instead.
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false)
on conflict (id) do update set public = false;

-- Files are stored at {user id}/{shot id}.webp, so the first folder in the path
-- is the owner's id. These four policies let a signed-in person touch files in
-- their own folder and nothing else.
drop policy if exists "screenshots are readable by their owner"   on storage.objects;
drop policy if exists "screenshots are uploadable by their owner" on storage.objects;
drop policy if exists "screenshots are updatable by their owner"  on storage.objects;
drop policy if exists "screenshots are deletable by their owner"  on storage.objects;

create policy "screenshots are readable by their owner"
  on storage.objects for select to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "screenshots are uploadable by their owner"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "screenshots are updatable by their owner"
  on storage.objects for update to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "screenshots are deletable by their owner"
  on storage.objects for delete to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------------- done
-- Nothing above grants anything to anonymous visitors. That is deliberate:
-- the only public surface is /share/[token], which runs on the server.
