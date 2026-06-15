CREATE TYPE tax_intake_status AS ENUM (
  'not_started',
  'in_progress',
  'needs_info',
  'submitted',
  'in_review',
  'accepted'
);

CREATE TYPE tax_intake_subject_scope AS ENUM (
  'primary',
  'partner',
  'joint',
  'household'
);

CREATE TYPE tax_intake_answer_source AS ENUM (
  'client',
  'partner',
  'admin',
  'document_ai',
  'system'
);

CREATE TYPE tax_intake_answer_status AS ENUM (
  'draft',
  'suggested',
  'confirmed',
  'rejected',
  'needs_review'
);

CREATE TYPE tax_intake_document_status AS ENUM (
  'suggested',
  'linked',
  'rejected',
  'reviewed'
);

CREATE TABLE tax_declaration_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  declaration_id uuid NOT NULL,
  client_id uuid NOT NULL,
  team_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  partner_subject_id uuid,
  template_key text NOT NULL,
  template_version integer NOT NULL,
  status tax_intake_status DEFAULT 'not_started' NOT NULL,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  accepted_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tax_declaration_intakes_declaration_id_fkey
    FOREIGN KEY (declaration_id) REFERENCES tax_declarations(id) ON DELETE CASCADE,
  CONSTRAINT tax_declaration_intakes_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES tax_clients(id) ON DELETE CASCADE,
  CONSTRAINT tax_declaration_intakes_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT tax_declaration_intakes_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES tax_subjects(id) ON DELETE CASCADE,
  CONSTRAINT tax_declaration_intakes_partner_subject_id_fkey
    FOREIGN KEY (partner_subject_id) REFERENCES tax_subjects(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX tax_declaration_intakes_declaration_key
  ON tax_declaration_intakes (declaration_id);

CREATE INDEX tax_declaration_intakes_client_status_idx
  ON tax_declaration_intakes (client_id, status);

CREATE INDEX tax_declaration_intakes_team_status_idx
  ON tax_declaration_intakes (team_id, status);

CREATE INDEX tax_declaration_intakes_subject_idx
  ON tax_declaration_intakes (subject_id);

INSERT INTO tax_declaration_intakes (
  declaration_id,
  client_id,
  team_id,
  subject_id,
  partner_subject_id,
  template_key,
  template_version,
  status,
  metadata
)
SELECT
  id,
  client_id,
  team_id,
  subject_id,
  partner_subject_id,
  'nl_income_tax_intake',
  1,
  'not_started',
  jsonb_build_object('createdFrom', 'migration_0046')
FROM tax_declarations
WHERE declaration_type IN ('income_tax_private', 'income_tax_entrepreneur')
ON CONFLICT (declaration_id) DO NOTHING;

CREATE TABLE tax_intake_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  intake_id uuid NOT NULL,
  declaration_id uuid NOT NULL,
  client_id uuid NOT NULL,
  team_id uuid NOT NULL,
  document_id uuid,
  section_key text NOT NULL,
  question_key text NOT NULL,
  subject_scope tax_intake_subject_scope NOT NULL,
  value jsonb NOT NULL,
  source tax_intake_answer_source DEFAULT 'client' NOT NULL,
  confidence integer,
  status tax_intake_answer_status DEFAULT 'draft' NOT NULL,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  reviewed_by_staff_user_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tax_intake_answers_intake_id_fkey
    FOREIGN KEY (intake_id) REFERENCES tax_declaration_intakes(id) ON DELETE CASCADE,
  CONSTRAINT tax_intake_answers_declaration_id_fkey
    FOREIGN KEY (declaration_id) REFERENCES tax_declarations(id) ON DELETE CASCADE,
  CONSTRAINT tax_intake_answers_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES tax_clients(id) ON DELETE CASCADE,
  CONSTRAINT tax_intake_answers_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT tax_intake_answers_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL,
  CONSTRAINT tax_intake_answers_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT tax_intake_answers_updated_by_user_id_fkey
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT tax_intake_answers_reviewed_by_staff_user_id_fkey
    FOREIGN KEY (reviewed_by_staff_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX tax_intake_answers_question_source_key
  ON tax_intake_answers (intake_id, question_key, subject_scope, source);

CREATE INDEX tax_intake_answers_intake_status_idx
  ON tax_intake_answers (intake_id, status);

CREATE INDEX tax_intake_answers_team_status_idx
  ON tax_intake_answers (team_id, status);

CREATE INDEX tax_intake_answers_document_idx
  ON tax_intake_answers (document_id);

CREATE TABLE tax_intake_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  intake_id uuid NOT NULL,
  declaration_id uuid NOT NULL,
  client_id uuid NOT NULL,
  team_id uuid NOT NULL,
  document_id uuid NOT NULL,
  document_type text,
  tax_year integer,
  section_key text NOT NULL,
  subject_scope tax_intake_subject_scope DEFAULT 'primary' NOT NULL,
  confidence integer,
  status tax_intake_document_status DEFAULT 'suggested' NOT NULL,
  raw_extraction jsonb DEFAULT '{}'::jsonb NOT NULL,
  redacted_extraction jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tax_intake_documents_intake_id_fkey
    FOREIGN KEY (intake_id) REFERENCES tax_declaration_intakes(id) ON DELETE CASCADE,
  CONSTRAINT tax_intake_documents_declaration_id_fkey
    FOREIGN KEY (declaration_id) REFERENCES tax_declarations(id) ON DELETE CASCADE,
  CONSTRAINT tax_intake_documents_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES tax_clients(id) ON DELETE CASCADE,
  CONSTRAINT tax_intake_documents_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT tax_intake_documents_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX tax_intake_documents_intake_document_section_key
  ON tax_intake_documents (intake_id, document_id, section_key);

CREATE INDEX tax_intake_documents_intake_status_idx
  ON tax_intake_documents (intake_id, status);

CREATE INDEX tax_intake_documents_team_status_idx
  ON tax_intake_documents (team_id, status);

CREATE INDEX tax_intake_documents_document_idx
  ON tax_intake_documents (document_id);

ALTER TABLE tax_tasks ADD COLUMN declaration_id uuid;
ALTER TABLE tax_tasks ADD COLUMN intake_id uuid;
ALTER TABLE tax_tasks ADD COLUMN question_key text;

ALTER TABLE tax_tasks ADD CONSTRAINT tax_tasks_declaration_id_fkey
  FOREIGN KEY (declaration_id) REFERENCES tax_declarations(id) ON DELETE SET NULL;

ALTER TABLE tax_tasks ADD CONSTRAINT tax_tasks_intake_id_fkey
  FOREIGN KEY (intake_id) REFERENCES tax_declaration_intakes(id) ON DELETE SET NULL;

CREATE INDEX tax_tasks_declaration_idx
  ON tax_tasks (declaration_id);

CREATE INDEX tax_tasks_intake_idx
  ON tax_tasks (intake_id);

ALTER TABLE tax_declaration_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_intake_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_intake_documents ENABLE ROW LEVEL SECURITY;
