-- KPI peso por scope (área / equipo / etc.)

CREATE TABLE IF NOT EXISTS kpi_scope_weights (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kpiId INT NOT NULL,
  scopeId INT NOT NULL,
  weight DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_kpi_scope_weight (kpiId, scopeId),
  INDEX idx_kpi (kpiId),
  INDEX idx_scope (scopeId),
  FOREIGN KEY (kpiId) REFERENCES kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (scopeId) REFERENCES org_scopes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
