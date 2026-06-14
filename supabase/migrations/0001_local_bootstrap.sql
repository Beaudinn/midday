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

CREATE OR REPLACE FUNCTION public.generate_inbox(length integer DEFAULT 10)
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT string_agg(
    substr('abcdefghijklmnopqrstuvwxyz0123456789', floor(random() * 36)::integer + 1, 1),
    ''
  )
  FROM generate_series(1, GREATEST(length, 1));
$$;

CREATE OR REPLACE FUNCTION public.generate_inbox_fts(name text, products text)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(products, ''));
$$;

CREATE OR REPLACE FUNCTION public.global_search(
  search_term text,
  team_id uuid,
  language text DEFAULT 'english',
  max_results integer DEFAULT 30,
  items_per_table_limit integer DEFAULT 5,
  relevance_threshold real DEFAULT 0.01
)
RETURNS TABLE(
  id uuid,
  type text,
  title text,
  relevance real,
  created_at timestamptz,
  data jsonb
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    NULL::uuid AS id,
    NULL::text AS type,
    NULL::text AS title,
    NULL::real AS relevance,
    NULL::timestamptz AS created_at,
    NULL::jsonb AS data
  WHERE false;
$$;

CREATE OR REPLACE FUNCTION public.global_semantic_search(
  team_id uuid,
  search_term text,
  start_date text DEFAULT NULL,
  end_date text DEFAULT NULL,
  types text[] DEFAULT NULL,
  amount numeric DEFAULT NULL,
  amount_min numeric DEFAULT NULL,
  amount_max numeric DEFAULT NULL,
  status text DEFAULT NULL,
  currency text DEFAULT NULL,
  language text DEFAULT 'english',
  due_date_start text DEFAULT NULL,
  due_date_end text DEFAULT NULL,
  max_results integer DEFAULT 20,
  items_per_table_limit integer DEFAULT 5
)
RETURNS TABLE(
  id uuid,
  type text,
  title text,
  relevance real,
  created_at timestamptz,
  data jsonb
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    NULL::uuid AS id,
    NULL::text AS type,
    NULL::text AS title,
    NULL::real AS relevance,
    NULL::timestamptz AS created_at,
    NULL::jsonb AS data
  WHERE false;
$$;

CREATE OR REPLACE FUNCTION public.match_similar_documents_by_title(
  document_id uuid,
  team_id uuid,
  match_threshold double precision DEFAULT 0.3,
  match_count integer DEFAULT 20
)
RETURNS TABLE(
  id uuid,
  name text,
  metadata jsonb,
  path_tokens text[],
  tag text,
  title text,
  summary text,
  title_similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    NULL::uuid AS id,
    NULL::text AS name,
    NULL::jsonb AS metadata,
    NULL::text[] AS path_tokens,
    NULL::text AS tag,
    NULL::text AS title,
    NULL::text AS summary,
    NULL::double precision AS title_similarity
  WHERE false;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(public.users.full_name, EXCLUDED.full_name),
      avatar_url = COALESCE(public.users.avatar_url, EXCLUDED.avatar_url);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE OR REPLACE FUNCTION public.sync_auth_users_to_public()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.users (id, email, full_name, avatar_url)
  SELECT
    auth.users.id,
    auth.users.email,
    COALESCE(
      auth.users.raw_user_meta_data->>'full_name',
      auth.users.raw_user_meta_data->>'name'
    ),
    auth.users.raw_user_meta_data->>'avatar_url'
  FROM auth.users
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(public.users.full_name, EXCLUDED.full_name),
      avatar_url = COALESCE(public.users.avatar_url, EXCLUDED.avatar_url);
END;
$$;

SELECT public.sync_auth_users_to_public();

DO $$
BEGIN
  IF to_regclass('public.teams') IS NOT NULL THEN
    UPDATE public.teams
    SET inbox_id = public.generate_inbox(10)
    WHERE inbox_id = 'generate_inbox(10)';
  END IF;
END;
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
