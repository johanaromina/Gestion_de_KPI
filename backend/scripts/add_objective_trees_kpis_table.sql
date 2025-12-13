-- Script para agregar la tabla objective_trees_kpis si no existe
-- Esta tabla relaciona los objetivos del árbol con los KPIs

USE gestion_kpi;

CREATE TABLE IF NOT EXISTS objective_trees_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  objectiveTreeId INT NOT NULL,
  kpiId INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (objectiveTreeId) REFERENCES objective_trees(id) ON DELETE CASCADE,
  FOREIGN KEY (kpiId) REFERENCES kpis(id) ON DELETE CASCADE,
  UNIQUE KEY unique_objective_kpi (objectiveTreeId, kpiId),
  INDEX idx_objective (objectiveTreeId),
  INDEX idx_kpi (kpiId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
