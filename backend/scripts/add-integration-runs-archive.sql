ALTER TABLE integration_template_runs
  ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0;
