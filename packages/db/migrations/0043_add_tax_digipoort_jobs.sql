CREATE TYPE tax_digipoort_operation AS ENUM (
  'request_mandate',
  'activate_mandate',
  'fetch_service_messages',
  'submit_return'
);

CREATE TYPE tax_digipoort_job_status AS ENUM (
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled'
);

CREATE TABLE tax_digipoort_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  team_id uuid NOT NULL,
  mandate_id uuid,
  service_order_id uuid,
  operation tax_digipoort_operation NOT NULL,
  status tax_digipoort_job_status DEFAULT 'queued' NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  result jsonb DEFAULT '{}'::jsonb NOT NULL,
  provider_reference text,
  error text,
  attempts integer DEFAULT 0 NOT NULL,
  queued_at timestamptz DEFAULT now() NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT tax_digipoort_jobs_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES tax_clients(id) ON DELETE CASCADE,
  CONSTRAINT tax_digipoort_jobs_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT tax_digipoort_jobs_mandate_id_fkey
    FOREIGN KEY (mandate_id) REFERENCES tax_mandates(id) ON DELETE SET NULL,
  CONSTRAINT tax_digipoort_jobs_service_order_id_fkey
    FOREIGN KEY (service_order_id) REFERENCES tax_service_orders(id) ON DELETE SET NULL
);

CREATE INDEX tax_digipoort_jobs_team_status_idx
  ON tax_digipoort_jobs (team_id, status);

CREATE INDEX tax_digipoort_jobs_client_created_idx
  ON tax_digipoort_jobs (client_id, created_at);

CREATE INDEX tax_digipoort_jobs_mandate_idx
  ON tax_digipoort_jobs (mandate_id);

ALTER TABLE tax_digipoort_jobs ENABLE ROW LEVEL SECURITY;
