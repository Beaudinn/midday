CREATE TYPE tax_subject_relationship_type AS ENUM (
  'spouse',
  'registered_partner',
  'cohabiting_partner',
  'former_partner',
  'other'
);

CREATE TYPE tax_subject_relationship_status AS ENUM (
  'active',
  'ended',
  'archived'
);

CREATE TABLE tax_subject_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  team_id uuid NOT NULL,
  primary_subject_id uuid NOT NULL,
  related_subject_id uuid NOT NULL,
  relationship_type tax_subject_relationship_type NOT NULL,
  fiscal_partner boolean DEFAULT true NOT NULL,
  status tax_subject_relationship_status DEFAULT 'active' NOT NULL,
  valid_from date,
  valid_to date,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tax_subject_relationships_distinct_subjects_check
    CHECK (primary_subject_id <> related_subject_id),
  CONSTRAINT tax_subject_relationships_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES tax_clients(id) ON DELETE CASCADE,
  CONSTRAINT tax_subject_relationships_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT tax_subject_relationships_primary_subject_id_fkey
    FOREIGN KEY (primary_subject_id) REFERENCES tax_subjects(id) ON DELETE CASCADE,
  CONSTRAINT tax_subject_relationships_related_subject_id_fkey
    FOREIGN KEY (related_subject_id) REFERENCES tax_subjects(id) ON DELETE CASCADE
);

CREATE INDEX tax_subject_relationships_client_status_idx
  ON tax_subject_relationships (client_id, status);

CREATE INDEX tax_subject_relationships_team_id_idx
  ON tax_subject_relationships (team_id);

CREATE INDEX tax_subject_relationships_primary_subject_idx
  ON tax_subject_relationships (primary_subject_id);

CREATE INDEX tax_subject_relationships_related_subject_idx
  ON tax_subject_relationships (related_subject_id);

ALTER TABLE tax_subject_relationships ENABLE ROW LEVEL SECURITY;
