-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- before deploying. This creates the two tables the app needs.

create table if not exists appointments (
  id uuid primary key,
  token text not null,
  patient text not null,
  phone text not null,
  doctor text not null,
  treatment text not null,
  slot text not null,
  date date not null,
  reason text not null default '',
  emergency boolean not null default false,
  status text not null default 'Waiting',
  created_at timestamptz not null default now()
);

create table if not exists patients (
  id uuid primary key,
  name text not null,
  phone text not null,
  pin_salt text not null,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  visits jsonb not null default '[]'::jsonb
);

-- Helpful indexes for lookups the app performs often.
create index if not exists appointments_date_slot_doctor_idx
  on appointments (date, slot, doctor);

create index if not exists patients_phone_name_idx
  on patients (phone, name);

-- Row Level Security: keep tables locked down from the public anon key.
-- The app uses the SERVICE ROLE key (server-side only, never shipped to
-- the browser), which bypasses RLS, so this just protects against anyone
-- else hitting the tables directly with the public key.
alter table appointments enable row level security;
alter table patients enable row level security;
