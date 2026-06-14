CREATE TYPE tax_mandate_type AS ENUM (
  'VIA',
  'SBA',
  'BTW',
  'IB'
);

CREATE TYPE tax_mandate_status AS ENUM (
  'draft',
  'requested',
  'letter_sent',
  'activation_required',
  'active',
  'rejected',
  'expired',
  'revoked'
);

CREATE TYPE tax_task_status AS ENUM (
  'open',
  'answered',
  'resolved',
  'cancelled'
);

CREATE TABLE tax_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  team_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  entitlement_id uuid,
  service_order_id uuid,
  mandate_type tax_mandate_type NOT NULL,
  tax_year integer,
  status tax_mandate_status DEFAULT 'draft' NOT NULL,
  activation_code_encrypted text,
  external_reference text,
  requested_at timestamptz DEFAULT now() NOT NULL,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tax_mandates_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES tax_clients(id) ON DELETE CASCADE,
  CONSTRAINT tax_mandates_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT tax_mandates_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES tax_subjects(id) ON DELETE CASCADE,
  CONSTRAINT tax_mandates_entitlement_id_fkey
    FOREIGN KEY (entitlement_id) REFERENCES tax_entitlements(id) ON DELETE SET NULL,
  CONSTRAINT tax_mandates_service_order_id_fkey
    FOREIGN KEY (service_order_id) REFERENCES tax_service_orders(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX tax_mandates_current_key
  ON tax_mandates (client_id, subject_id, mandate_type)
  WHERE tax_year IS NULL;

CREATE UNIQUE INDEX tax_mandates_year_key
  ON tax_mandates (client_id, subject_id, mandate_type, tax_year)
  WHERE tax_year IS NOT NULL;

CREATE INDEX tax_mandates_client_status_idx
  ON tax_mandates (client_id, status);

CREATE INDEX tax_mandates_team_status_idx
  ON tax_mandates (team_id, status);

CREATE INDEX tax_mandates_subject_idx
  ON tax_mandates (subject_id);

CREATE INDEX tax_mandates_entitlement_idx
  ON tax_mandates (entitlement_id);

ALTER TABLE tax_mandates ENABLE ROW LEVEL SECURITY;

CREATE TABLE tax_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  team_id uuid NOT NULL,
  subject_id uuid,
  mandate_id uuid,
  assigned_to_user_id uuid,
  assigned_to_staff_user_id uuid,
  title text NOT NULL,
  description text,
  status tax_task_status DEFAULT 'open' NOT NULL,
  due_date date,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  resolved_at timestamptz,
  CONSTRAINT tax_tasks_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES tax_clients(id) ON DELETE CASCADE,
  CONSTRAINT tax_tasks_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT tax_tasks_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES tax_subjects(id) ON DELETE SET NULL,
  CONSTRAINT tax_tasks_mandate_id_fkey
    FOREIGN KEY (mandate_id) REFERENCES tax_mandates(id) ON DELETE SET NULL,
  CONSTRAINT tax_tasks_assigned_to_user_id_fkey
    FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT tax_tasks_assigned_to_staff_user_id_fkey
    FOREIGN KEY (assigned_to_staff_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX tax_tasks_client_status_idx
  ON tax_tasks (client_id, status);

CREATE INDEX tax_tasks_team_status_idx
  ON tax_tasks (team_id, status);

CREATE INDEX tax_tasks_subject_idx
  ON tax_tasks (subject_id);

CREATE INDEX tax_tasks_mandate_idx
  ON tax_tasks (mandate_id);

ALTER TABLE tax_tasks ENABLE ROW LEVEL SECURITY;

WITH entitlement_mandates AS (
  SELECT
    tc.id AS client_id,
    tc.team_id,
    primary_subject.subject_id,
    te.id AS entitlement_id,
    required_mandate::tax_mandate_type AS mandate_type
  FROM tax_entitlements te
  INNER JOIN tax_clients tc
    ON tc.id = te.client_id
  INNER JOIN tax_service_products tsp
    ON tsp.id = te.product_id
  CROSS JOIN LATERAL unnest(tsp.required_mandates) AS required_mandate
  CROSS JOIN LATERAL (
    SELECT tcs.subject_id
    FROM tax_client_subjects tcs
    WHERE tcs.client_id = tc.id
    ORDER BY CASE tcs.role
      WHEN 'primary' THEN 0
      WHEN 'business_entity' THEN 1
      WHEN 'partner' THEN 2
      ELSE 3
    END
    LIMIT 1
  ) AS primary_subject
  WHERE te.status = 'active'
    AND te.auto_request_mandates = true
    AND required_mandate IN ('VIA', 'SBA', 'BTW', 'IB')
)
INSERT INTO tax_mandates (
  client_id,
  team_id,
  subject_id,
  entitlement_id,
  mandate_type,
  status
)
SELECT
  client_id,
  team_id,
  subject_id,
  entitlement_id,
  mandate_type,
  'requested'
FROM entitlement_mandates
ON CONFLICT DO NOTHING;

INSERT INTO tax_tasks (
  client_id,
  team_id,
  subject_id,
  mandate_id,
  assigned_to_user_id,
  assigned_to_staff_user_id,
  title,
  description,
  due_date
)
SELECT
  tm.client_id,
  tm.team_id,
  tm.subject_id,
  tm.id,
  tc.primary_user_id,
  tc.assigned_staff_user_id,
  CASE tm.mandate_type
    WHEN 'BTW' THEN 'Activate VAT authorization'
    WHEN 'IB' THEN 'Activate income tax authorization'
    WHEN 'SBA' THEN 'Activate SBA service messages'
    WHEN 'VIA' THEN 'Activate VIA retrieval'
  END,
  CASE tm.mandate_type
    WHEN 'BTW' THEN 'Enter the activation code or authorization details for VAT return filing.'
    WHEN 'IB' THEN 'Enter the activation code or authorization details for income tax filing.'
    WHEN 'SBA' THEN 'Enter the activation code for service messages after the authorization letter is received.'
    WHEN 'VIA' THEN 'Enter the activation code for pre-filled tax data retrieval after the authorization letter is received.'
  END,
  current_date + 30
FROM tax_mandates tm
INNER JOIN tax_clients tc
  ON tc.id = tm.client_id
WHERE tm.status IN ('draft', 'requested', 'letter_sent', 'activation_required')
  AND NOT EXISTS (
    SELECT 1
    FROM tax_tasks tt
    WHERE tt.mandate_id = tm.id
      AND tt.status = 'open'
  );
