CREATE TABLE public.email_addresses (
  id uuid primary key default gen_random_uuid(),
  address text not null unique,
  label text,
  created_at timestamptz not null default now(),
  CONSTRAINT email_addresses_address_format CHECK (address ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

GRANT SELECT, INSERT, DELETE ON public.email_addresses TO anon, authenticated;
GRANT ALL ON public.email_addresses TO service_role;

ALTER TABLE public.email_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read email addresses"
  ON public.email_addresses FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can register a receiving address"
  ON public.email_addresses FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can remove a registered address"
  ON public.email_addresses FOR DELETE
  TO anon, authenticated
  USING (true);

-- Stream new rows of the emails table to connected clients over Supabase Realtime.
ALTER PUBLICATION supabase_realtime ADD TABLE public.emails;
