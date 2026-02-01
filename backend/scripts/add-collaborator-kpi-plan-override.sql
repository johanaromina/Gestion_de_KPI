ALTER TABLE collaborator_kpi_plan
  CHANGE COLUMN weight weightOverride DECIMAL(6,2) NULL DEFAULT NULL;
