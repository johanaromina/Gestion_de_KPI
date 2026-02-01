-- Crea tabla para guardar el plan mensual de KPIs por colaborador
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
  FOREIGN KEY (subPeriodId) REFERENCES sub_periods(id) ON DELETE CASCADE,
  INDEX idx_plan_collab (collaboratorId, periodId),
  INDEX idx_plan_kpi (kpiId, periodId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
