CREATE TYPE tax_client_kind AS ENUM (
  'private_person',
  'household',
  'sole_proprietor',
  'company'
);

CREATE TYPE tax_client_status AS ENUM (
  'lead',
  'invited',
  'active',
  'paused',
  'archived'
);

CREATE TYPE tax_subject_type AS ENUM (
  'private_person',
  'sole_proprietor',
  'company'
);

CREATE TYPE tax_client_subject_role AS ENUM (
  'primary',
  'partner',
  'dependent',
  'business_entity'
);

CREATE TYPE tax_client_subject_access_status AS ENUM (
  'active',
  'view_only',
  'removed'
);

CREATE TYPE tax_entitlement_source AS ENUM (
  'team_plan',
  'polar_subscription',
  'polar_order',
  'manual'
);

CREATE TYPE tax_entitlement_status AS ENUM (
  'pending',
  'active',
  'paused',
  'cancelled',
  'expired'
);

CREATE TYPE tax_service_order_status AS ENUM (
  'draft',
  'ordered',
  'paid',
  'in_progress',
  'completed',
  'cancelled'
);

CREATE TABLE tax_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  team_id uuid NOT NULL,
  primary_user_id uuid,
  client_kind tax_client_kind NOT NULL,
  status tax_client_status DEFAULT 'lead' NOT NULL,
  assigned_staff_user_id uuid,
  onboarding_status text DEFAULT 'not_started' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tax_clients_team_id_key UNIQUE (team_id),
  CONSTRAINT tax_clients_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT tax_clients_primary_user_id_fkey
    FOREIGN KEY (primary_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT tax_clients_assigned_staff_user_id_fkey
    FOREIGN KEY (assigned_staff_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX tax_clients_status_idx
  ON tax_clients (status);

CREATE INDEX tax_clients_assigned_staff_idx
  ON tax_clients (assigned_staff_user_id);

ALTER TABLE tax_clients ENABLE ROW LEVEL SECURITY;

CREATE TABLE tax_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  subject_type tax_subject_type NOT NULL,
  display_name text NOT NULL,
  encrypted_bsn text,
  encrypted_rsin text,
  kvk_number text,
  vat_number text,
  country_code text DEFAULT 'NL' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tax_subjects_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX tax_subjects_user_id_idx
  ON tax_subjects (user_id);

CREATE INDEX tax_subjects_country_code_idx
  ON tax_subjects (country_code);

ALTER TABLE tax_subjects ENABLE ROW LEVEL SECURITY;

CREATE TABLE tax_client_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  team_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  role tax_client_subject_role NOT NULL,
  access_status tax_client_subject_access_status DEFAULT 'active' NOT NULL,
  valid_from date,
  valid_to date,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tax_client_subjects_client_subject_key UNIQUE (client_id, subject_id),
  CONSTRAINT tax_client_subjects_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES tax_clients(id) ON DELETE CASCADE,
  CONSTRAINT tax_client_subjects_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT tax_client_subjects_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES tax_subjects(id) ON DELETE CASCADE
);

CREATE INDEX tax_client_subjects_team_id_idx
  ON tax_client_subjects (team_id);

CREATE INDEX tax_client_subjects_subject_id_idx
  ON tax_client_subjects (subject_id);

ALTER TABLE tax_client_subjects ENABLE ROW LEVEL SECURITY;

CREATE TABLE tax_service_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  required_mandates text[] DEFAULT ARRAY[]::text[] NOT NULL,
  default_return_type text,
  polar_product_id text,
  included_in_plans text[] DEFAULT ARRAY[]::text[] NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tax_service_products_code_key UNIQUE (code)
);

CREATE INDEX tax_service_products_active_idx
  ON tax_service_products (active);

ALTER TABLE tax_service_products ENABLE ROW LEVEL SECURITY;

CREATE TABLE tax_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  team_id uuid NOT NULL,
  product_id uuid NOT NULL,
  source tax_entitlement_source NOT NULL,
  source_ref text,
  status tax_entitlement_status DEFAULT 'pending' NOT NULL,
  starts_at timestamptz DEFAULT now() NOT NULL,
  ends_at timestamptz,
  auto_request_mandates boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tax_entitlements_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES tax_clients(id) ON DELETE CASCADE,
  CONSTRAINT tax_entitlements_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT tax_entitlements_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES tax_service_products(id) ON DELETE RESTRICT
);

CREATE INDEX tax_entitlements_client_status_idx
  ON tax_entitlements (client_id, status);

CREATE INDEX tax_entitlements_team_status_idx
  ON tax_entitlements (team_id, status);

CREATE UNIQUE INDEX tax_entitlements_client_product_source_key
  ON tax_entitlements (client_id, product_id, source, COALESCE(source_ref, ''));

ALTER TABLE tax_entitlements ENABLE ROW LEVEL SECURITY;

CREATE TABLE tax_service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  team_id uuid NOT NULL,
  product_id uuid NOT NULL,
  tax_year integer,
  period text,
  polar_order_id text,
  status tax_service_order_status DEFAULT 'draft' NOT NULL,
  ordered_by_user_id uuid,
  created_by_staff_user_id uuid,
  ordered_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tax_service_orders_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES tax_clients(id) ON DELETE CASCADE,
  CONSTRAINT tax_service_orders_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT tax_service_orders_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES tax_service_products(id) ON DELETE RESTRICT,
  CONSTRAINT tax_service_orders_ordered_by_user_id_fkey
    FOREIGN KEY (ordered_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT tax_service_orders_created_by_staff_user_id_fkey
    FOREIGN KEY (created_by_staff_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX tax_service_orders_client_status_idx
  ON tax_service_orders (client_id, status);

CREATE INDEX tax_service_orders_team_id_idx
  ON tax_service_orders (team_id);

ALTER TABLE tax_service_orders ENABLE ROW LEVEL SECURITY;

INSERT INTO tax_service_products (
  code,
  name,
  required_mandates,
  default_return_type,
  included_in_plans,
  active
)
VALUES
  ('vat_return', 'VAT return', ARRAY['BTW'], 'VAT', ARRAY[]::text[], true),
  ('income_tax_private', 'Income tax private', ARRAY['VIA', 'SBA', 'IB'], 'INCOME_TAX', ARRAY[]::text[], true),
  ('income_tax_entrepreneur', 'Income tax entrepreneur', ARRAY['VIA', 'SBA', 'IB'], 'INCOME_TAX', ARRAY[]::text[], true),
  ('via_retrieval', 'VIA retrieval', ARRAY['VIA'], NULL, ARRAY[]::text[], true),
  ('sba_monitoring', 'SBA monitoring', ARRAY['SBA'], NULL, ARRAY[]::text[], true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    required_mandates = EXCLUDED.required_mandates,
    default_return_type = EXCLUDED.default_return_type,
    included_in_plans = EXCLUDED.included_in_plans,
    active = EXCLUDED.active,
    updated_at = now();
