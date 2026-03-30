-- Manolo — Schema para Supabase
-- Correr en: Supabase Dashboard → SQL Editor

create table if not exists leads (
  id bigserial primary key,
  ml_id text unique not null,
  title text,
  price_usd float,
  price_ars float,
  year int,
  km int,
  seller_name text,
  seller_phone text,
  url text,
  rating float default 0,
  status text default 'nuevo',
  notes text,
  image_url text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists price_history (
  id bigserial primary key,
  ml_id text,
  price_usd float,
  scraped_at timestamptz default now()
);

create table if not exists agent_memory (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

create table if not exists conversations (
  id bigserial primary key,
  session_id text not null,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists search_log (
  id bigserial primary key,
  query text,
  results_count int,
  searched_at timestamptz default now()
);

-- Deshabilitar RLS (app interna, sin auth de usuarios)
alter table leads disable row level security;
alter table price_history disable row level security;
alter table agent_memory disable row level security;
alter table conversations disable row level security;
alter table search_log disable row level security;
