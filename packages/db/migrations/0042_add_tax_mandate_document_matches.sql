CREATE TYPE tax_mandate_document_match_status AS ENUM (
  'pending',
  'matched',
  'needs_review',
  'failed',
  'confirmed',
  'ignored'
);

CREATE TABLE tax_mandate_document_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  team_id uuid NOT NULL,
  mandate_id uuid NOT NULL,
  task_id uuid,
  document_id uuid,
  uploaded_by_user_id uuid,
  file_path_tokens text[] NOT NULL,
  mimetype text NOT NULL,
  size integer,
  status tax_mandate_document_match_status DEFAULT 'pending' NOT NULL,
  extracted_code_encrypted text,
  extracted_code_preview text,
  extracted_mandate_type tax_mandate_type,
  extracted_tax_year integer,
  extraction_confidence integer,
  extraction_reason text,
  raw_extraction jsonb DEFAULT '{}'::jsonb NOT NULL,
  matched_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tax_mandate_document_matches_file_mandate_key
    UNIQUE (team_id, mandate_id, file_path_tokens),
  CONSTRAINT tax_mandate_document_matches_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES tax_clients(id) ON DELETE CASCADE,
  CONSTRAINT tax_mandate_document_matches_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT tax_mandate_document_matches_mandate_id_fkey
    FOREIGN KEY (mandate_id) REFERENCES tax_mandates(id) ON DELETE CASCADE,
  CONSTRAINT tax_mandate_document_matches_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES tax_tasks(id) ON DELETE SET NULL,
  CONSTRAINT tax_mandate_document_matches_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL,
  CONSTRAINT tax_mandate_document_matches_uploaded_by_user_id_fkey
    FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX tax_mandate_document_matches_team_status_idx
  ON tax_mandate_document_matches (team_id, status);

CREATE INDEX tax_mandate_document_matches_mandate_idx
  ON tax_mandate_document_matches (mandate_id);

CREATE INDEX tax_mandate_document_matches_task_idx
  ON tax_mandate_document_matches (task_id);

CREATE INDEX tax_mandate_document_matches_document_idx
  ON tax_mandate_document_matches (document_id);

ALTER TABLE tax_mandate_document_matches ENABLE ROW LEVEL SECURITY;
