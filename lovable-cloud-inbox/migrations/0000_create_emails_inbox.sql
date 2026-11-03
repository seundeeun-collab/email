create table public.emails (
  id bigint generated always as identity primary key,
  to_addr text not null,
  from_addr text not null default 'unknown@unknown.invalid',
  subject text not null default '(no subject)',
  body_text text,
  body_html text,
  raw_mime text not null,
  message_id text,
  source text not null default 'inbound',
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index emails_inbox_received_idx on public.emails (to_addr, received_at desc);
create index emails_received_idx on public.emails (received_at desc);

GRANT SELECT ON public.emails TO anon;
GRANT SELECT ON public.emails TO authenticated;
GRANT ALL ON public.emails TO service_role;

ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to received emails"
  ON public.emails FOR SELECT
  TO anon, authenticated
  USING (true);
