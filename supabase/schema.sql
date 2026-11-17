-- ============================================================
-- Curso de Eletricista (learis.com.br)
-- Tabelas do sistema no Supabase.
--
-- COMO USAR:
-- 1. Abra o painel do Supabase do projeto
-- 2. Menu "SQL Editor" > "New query"
-- 3. Cole TODO este arquivo e clique em "Run"
--
-- Pode rodar mais de uma vez: nao apaga dados existentes.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------ usuarios
create table if not exists public.usuarios (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  email       text not null unique,
  senha_hash  text not null,
  confirmado  boolean not null default false,
  liberado    boolean not null default false,
  liberado_em timestamptz,
  criado_ip   text,
  criado_em   timestamptz not null default now()
);

-- ------------------------------------------------------------ sessoes
create table if not exists public.sessoes (
  token_hash text primary key,
  user_id    uuid not null references public.usuarios(id) on delete cascade,
  expira_em  timestamptz not null,
  criado_em  timestamptz not null default now()
);

create index if not exists idx_sessoes_user on public.sessoes (user_id);

-- ------------------------------------------------------------ tokens de e-mail
create table if not exists public.email_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.usuarios(id) on delete cascade,
  tipo       text not null check (tipo in ('confirmar', 'recuperar')),
  token_hash text not null,
  expira_em  timestamptz not null,
  usado      boolean not null default false,
  criado_em  timestamptz not null default now()
);

create index if not exists idx_email_tokens_hash on public.email_tokens (token_hash);
create index if not exists idx_email_tokens_user on public.email_tokens (user_id);

-- ------------------------------------------------------------ pagamentos
create table if not exists public.pagamentos (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.usuarios(id) on delete cascade,
  mp_id     text unique,
  valor     numeric(10, 2) not null,
  status    text not null,
  metodo    text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_pagamentos_user on public.pagamentos (user_id);
create index if not exists idx_pagamentos_mp on public.pagamentos (mp_id);

-- ------------------------------------------------------------ seguranca
-- RLS ligado e SEM politicas: apenas a service_role key (usada pelo servidor)
-- consegue ler/escrever. A chave anon nao acessa nada.
alter table public.usuarios      enable row level security;
alter table public.sessoes       enable row level security;
alter table public.email_tokens  enable row level security;
alter table public.pagamentos    enable row level security;

-- Conferir se ficou tudo certo:
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('usuarios', 'sessoes', 'email_tokens', 'pagamentos')
order by table_name;
