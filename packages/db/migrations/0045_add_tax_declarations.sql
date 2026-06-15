CREATE TYPE tax_declaration_type AS ENUM (
  'income_tax_private',
  'income_tax_entrepreneur',
  'vat_return'
);

CREATE TYPE tax_declaration_status AS ENUM (
  'draft',
  'collecting',
  'ready_for_review',
  'in_review',
  'approved',
  'queued_for_submission',
  'submitted',
  'accepted',
  'rejected',
  'cancelled'
);

CREATE TABLE tax_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  team_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  partner_subject_id uuid,
  subject_relationship_id uuid,
  entitlement_id uuid,
  service_order_id uuid,
  declaration_type tax_declaration_type NOT NULL,
  tax_year integer NOT NULL,
  period text,
  period_start date,
  period_end date,
  deadline_date date,
  status tax_declaration_status DEFAULT 'draft' NOT NULL,
  approved_at timestamptz,
  submitted_at timestamptz,
  provider_reference text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tax_declarations_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES tax_clients(id) ON DELETE CASCADE,
  CONSTRAINT tax_declarations_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT tax_declarations_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES tax_subjects(id) ON DELETE CASCADE,
  CONSTRAINT tax_declarations_partner_subject_id_fkey
    FOREIGN KEY (partner_subject_id) REFERENCES tax_subjects(id) ON DELETE SET NULL,
  CONSTRAINT tax_declarations_subject_relationship_id_fkey
    FOREIGN KEY (subject_relationship_id) REFERENCES tax_subject_relationships(id) ON DELETE SET NULL,
  CONSTRAINT tax_declarations_entitlement_id_fkey
    FOREIGN KEY (entitlement_id) REFERENCES tax_entitlements(id) ON DELETE SET NULL,
  CONSTRAINT tax_declarations_service_order_id_fkey
    FOREIGN KEY (service_order_id) REFERENCES tax_service_orders(id) ON DELETE SET NULL,
  CONSTRAINT tax_declarations_period_bounds_check CHECK (
    (period_start IS NULL AND period_end IS NULL)
    OR (period_start IS NOT NULL AND period_end IS NOT NULL AND period_start <= period_end)
  ),
  CONSTRAINT tax_declarations_vat_period_required_check CHECK (
    declaration_type <> 'vat_return'
    OR (period_start IS NOT NULL AND period_end IS NOT NULL)
  )
);

CREATE UNIQUE INDEX tax_declarations_year_key
  ON tax_declarations (client_id, subject_id, declaration_type, tax_year)
  WHERE period_start IS NULL AND period_end IS NULL;

CREATE UNIQUE INDEX tax_declarations_period_key
  ON tax_declarations (
    client_id,
    subject_id,
    declaration_type,
    tax_year,
    period_start,
    period_end
  )
  WHERE period_start IS NOT NULL AND period_end IS NOT NULL;

CREATE INDEX tax_declarations_client_status_idx
  ON tax_declarations (client_id, status);

CREATE INDEX tax_declarations_team_status_idx
  ON tax_declarations (team_id, status);

CREATE INDEX tax_declarations_subject_idx
  ON tax_declarations (subject_id);

CREATE INDEX tax_declarations_service_order_idx
  ON tax_declarations (service_order_id);

ALTER TABLE tax_declarations ENABLE ROW LEVEL SECURITY;
