USE gestion_kpi;

-- Legacy incremental migration.
-- La migracion canonica actual es backend/scripts/add-scope-kpis.sql.
-- Este archivo se mantiene para instalaciones antiguas que solo necesiten data_source_mappings.

CREATE TABLE IF NOT EXISTS data_source_mappings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sourceType VARCHAR(50) NOT NULL DEFAULT 'global',
  entityType ENUM('collaborator', 'org_scope') NOT NULL,
  entityId INT NOT NULL,
  externalKey VARCHAR(255) NOT NULL,
  normalizedKey VARCHAR(255) NOT NULL,
  externalLabel VARCHAR(255) NULL,
  metadata TEXT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_data_source_mapping (sourceType, entityType, normalizedKey),
  INDEX idx_data_source_mapping_entity (entityType, entityId),
  INDEX idx_data_source_mapping_source (sourceType)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
