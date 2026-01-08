-- Crea columna para plan anual (si aún no existe)
ALTER TABLE collaborator_kpis
  ADD COLUMN planValue DECIMAL(12,2) NULL AFTER comments;

CREATE TABLE IF NOT EXISTS kpi_evolutions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collaboratorId INT NOT NULL,
  kpiId INT NOT NULL,
  periodId INT NULL,
  monthDate DATE NOT NULL,
  planValue DECIMAL(12,2) NULL,
  actualValue DECIMAL(12,2) NULL,
  variation DECIMAL(12,2) NULL,
  weightedResult DECIMAL(12,2) NULL,
  source VARCHAR(255) NULL,
  modality VARCHAR(100) NULL,
  typeHint VARCHAR(100) NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_kpi_collab_month (collaboratorId, kpiId, monthDate),
  INDEX idx_kpi (kpiId),
  INDEX idx_collaborator (collaboratorId),
  INDEX idx_period (periodId),
  FOREIGN KEY (collaboratorId) REFERENCES collaborators(id) ON DELETE CASCADE,
  FOREIGN KEY (kpiId) REFERENCES kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
