CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.get_teams_for_authenticated_user()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  SELECT '00000000-0000-0000-0000-000000000000'::uuid LIMIT 0;
$$;

CREATE OR REPLACE FUNCTION public.extract_product_names(products json)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(string_agg(value->>'name', ' '), '')
  FROM json_array_elements(COALESCE(products, '[]'::json)) AS value
  WHERE value->>'name' IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.generate_inbox_fts(name text, products text)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(products, ''));
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('vault', 'vault', false, 52428800, NULL),
  ('avatars', 'avatars', true, 52428800, NULL),
  ('apps', 'apps', true, 52428800, NULL)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
