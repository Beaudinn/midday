CREATE TYPE workspace_type AS ENUM ('business', 'personal', 'household');

CREATE TYPE platform_staff_role AS ENUM (
  'platform_owner',
  'admin',
  'reviewer',
  'submitter',
  'support',
  'billing',
  'auditor'
);

ALTER TABLE teams
  ADD COLUMN workspace_type workspace_type DEFAULT 'business' NOT NULL;

CREATE TABLE platform_staff (
  user_id uuid PRIMARY KEY NOT NULL,
  role platform_staff_role NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT platform_staff_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX platform_staff_active_idx
  ON platform_staff (active);

ALTER TABLE platform_staff ENABLE ROW LEVEL SECURITY;

CREATE TABLE tax_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  team_id uuid,
  actor_user_id uuid,
  actor_staff_user_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  ip_address text,
  user_agent text,
  CONSTRAINT tax_audit_events_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  CONSTRAINT tax_audit_events_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT tax_audit_events_actor_staff_user_id_fkey
    FOREIGN KEY (actor_staff_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX tax_audit_events_team_created_at_idx
  ON tax_audit_events (team_id, created_at);

CREATE INDEX tax_audit_events_actor_staff_idx
  ON tax_audit_events (actor_staff_user_id);

CREATE INDEX tax_audit_events_resource_idx
  ON tax_audit_events (resource_type, resource_id);

ALTER TABLE tax_audit_events ENABLE ROW LEVEL SECURITY;
