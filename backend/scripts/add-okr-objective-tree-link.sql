USE gestion_kpi;

-- Tabla de relacion N:N entre OKRs y nodos del Arbol de Objetivos
CREATE TABLE IF NOT EXISTS okr_objective_tree_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  okrObjectiveId INT NOT NULL,
  objectiveTreeId INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (okrObjectiveId) REFERENCES okr_objectives(id) ON DELETE CASCADE,
  FOREIGN KEY (objectiveTreeId) REFERENCES objective_trees(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_okr_tree_link (okrObjectiveId, objectiveTreeId),
  INDEX idx_okr_tree_okr (okrObjectiveId),
  INDEX idx_okr_tree_tree (objectiveTreeId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
