-- Legacy incremental migration.
-- Este ajuste ya esta incluido en backend/scripts/add-scope-kpis.sql.
-- Dejalo solo para instalaciones antiguas que necesiten aplicar el cambio puntual.

ALTER TABLE integration_targets
  MODIFY COLUMN scopeType ENUM('company', 'area', 'team', 'person', 'product') NOT NULL DEFAULT 'area';
