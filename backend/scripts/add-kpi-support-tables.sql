CREATE TABLE IF NOT EXISTS kpi_areas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kpiId INT NOT NULL,
  area VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_kpi_area (kpiId, area),
  FOREIGN KEY (kpiId) REFERENCES kpis(id) ON DELETE CASCADE,
  INDEX idx_area (area)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kpi_periods (
  kpiId INT NOT NULL,
  periodId INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kpiId, periodId),
  FOREIGN KEY (kpiId) REFERENCES kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS collaborator_kpi_plan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collaboratorId INT NOT NULL,
  kpiId INT NOT NULL,
  periodId INT NOT NULL,
  subPeriodId INT NOT NULL,
  target DECIMAL(12,2) NOT NULL,
  weightOverride DECIMAL(6,2) NULL DEFAULT NULL,
  source VARCHAR(255) NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_plan (collaboratorId, kpiId, periodId, subPeriodId),
  FOREIGN KEY (collaboratorId) REFERENCES collaborators(id) ON DELETE CASCADE,
  FOREIGN KEY (kpiId) REFERENCES kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE,
  FOREIGN KEY (subPeriodId) REFERENCES calendar_subperiods(id) ON DELETE CASCADE,
  INDEX idx_plan_collab (collaboratorId, periodId),
  INDEX idx_plan_kpi (kpiId, periodId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'collaborator_kpis' AND column_name = 'planValue') = 0,
  'ALTER TABLE collaborator_kpis ADD COLUMN planValue DECIMAL(12,2) NULL AFTER comments',
  'SELECT ''collaborator_kpis.planValue ya existe'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
