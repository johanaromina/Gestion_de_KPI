-- Agrega tablas de resumen anual por periodo/colaborador
CREATE TABLE IF NOT EXISTS period_summaries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  periodId INT NOT NULL,
  collaboratorId INT NOT NULL,
  totalWeight DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  totalWeightedResult DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  overallResult DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status ENUM('open', 'closed') NOT NULL DEFAULT 'closed',
  generatedBy INT NULL,
  generatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_period_collaborator (periodId, collaboratorId),
  INDEX idx_period_summary_period (periodId),
  INDEX idx_period_summary_collaborator (collaboratorId),
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE,
  FOREIGN KEY (collaboratorId) REFERENCES collaborators(id) ON DELETE CASCADE,
  FOREIGN KEY (generatedBy) REFERENCES collaborators(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS period_summary_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  summaryId INT NOT NULL,
  kpiId INT NOT NULL,
  target DECIMAL(10,2) NULL,
  actual DECIMAL(10,2) NULL,
  variation DECIMAL(10,2) NULL,
  weight DECIMAL(10,2) NULL,
  weightedResult DECIMAL(10,2) NULL,
  status ENUM('draft', 'proposed', 'approved', 'closed') NOT NULL DEFAULT 'draft',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_summary_item_summary (summaryId),
  INDEX idx_summary_item_kpi (kpiId),
  UNIQUE KEY uniq_summary_kpi (summaryId, kpiId),
  FOREIGN KEY (summaryId) REFERENCES period_summaries(id) ON DELETE CASCADE,
  FOREIGN KEY (kpiId) REFERENCES kpis(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

