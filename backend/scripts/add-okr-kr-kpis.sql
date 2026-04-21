-- Múltiples KPIs por Key Result
CREATE TABLE IF NOT EXISTS okr_kr_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  krId INT NOT NULL,
  collaboratorKpiId INT NULL,
  scopeKpiId INT NULL,
  FOREIGN KEY (krId) REFERENCES okr_key_results(id) ON DELETE CASCADE,
  FOREIGN KEY (collaboratorKpiId) REFERENCES collaborator_kpis(id) ON DELETE SET NULL,
  FOREIGN KEY (scopeKpiId) REFERENCES scope_kpis(id) ON DELETE SET NULL,
  INDEX idx_okr_kr_kpis_kr (krId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrar datos existentes: si un KR ya tiene collaboratorKpiId o scopeKpiId, copiarlo a la nueva tabla
INSERT IGNORE INTO okr_kr_kpis (krId, collaboratorKpiId, scopeKpiId)
SELECT id, collaboratorKpiId, scopeKpiId
FROM okr_key_results
WHERE collaboratorKpiId IS NOT NULL OR scopeKpiId IS NOT NULL;

SELECT CONCAT('Migradas ', COUNT(*), ' vinculaciones existentes a okr_kr_kpis') AS resultado
FROM okr_kr_kpis;
