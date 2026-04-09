USE gestion_kpi;

-- ============================================================
-- OKR Layer: Objectives & Key Results
-- Depende de: collaborators, org_scopes, periods,
--             collaborator_kpis, scope_kpis
-- ============================================================

-- 1. Objetivos (pueden anidarse: empresa → area → equipo → individuo)
CREATE TABLE IF NOT EXISTS okr_objectives (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  parentId INT NULL,
  orgScopeId INT NULL,
  periodId INT NOT NULL,
  ownerId INT NOT NULL,
  status ENUM('draft', 'active', 'closed') NOT NULL DEFAULT 'active',
  progress DECIMAL(5,2) NOT NULL DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parentId) REFERENCES okr_objectives(id) ON DELETE SET NULL,
  FOREIGN KEY (orgScopeId) REFERENCES org_scopes(id) ON DELETE SET NULL,
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE,
  FOREIGN KEY (ownerId) REFERENCES collaborators(id) ON DELETE CASCADE,
  INDEX idx_okr_obj_parent (parentId),
  INDEX idx_okr_obj_period (periodId),
  INDEX idx_okr_obj_scope (orgScopeId),
  INDEX idx_okr_obj_owner (ownerId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Key Results: simple (valor manual) o vinculado al motor KPI existente
CREATE TABLE IF NOT EXISTS okr_key_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  objectiveId INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  krType ENUM('simple', 'kpi_linked') NOT NULL DEFAULT 'simple',
  -- Tipo simple: seguimiento manual
  startValue DECIMAL(15,4) NULL,
  targetValue DECIMAL(15,4) NULL,
  currentValue DECIMAL(15,4) NULL,
  unit VARCHAR(50) NULL,
  -- Tipo kpi_linked: delega al motor KPI existente
  collaboratorKpiId INT NULL,
  scopeKpiId INT NULL,
  -- Comun
  weight DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  ownerId INT NULL,
  status ENUM('not_started', 'on_track', 'at_risk', 'behind', 'completed') NOT NULL DEFAULT 'not_started',
  sortOrder INT NOT NULL DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (objectiveId) REFERENCES okr_objectives(id) ON DELETE CASCADE,
  FOREIGN KEY (collaboratorKpiId) REFERENCES collaborator_kpis(id) ON DELETE SET NULL,
  FOREIGN KEY (scopeKpiId) REFERENCES scope_kpis(id) ON DELETE SET NULL,
  FOREIGN KEY (ownerId) REFERENCES collaborators(id) ON DELETE SET NULL,
  INDEX idx_okr_kr_objective (objectiveId),
  INDEX idx_okr_kr_collab_kpi (collaboratorKpiId),
  INDEX idx_okr_kr_scope_kpi (scopeKpiId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Check-ins para KRs de tipo simple (los kpi_linked usan kpi_measurements)
CREATE TABLE IF NOT EXISTS okr_check_ins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  keyResultId INT NOT NULL,
  value DECIMAL(15,4) NOT NULL,
  note TEXT NULL,
  authorId INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (keyResultId) REFERENCES okr_key_results(id) ON DELETE CASCADE,
  FOREIGN KEY (authorId) REFERENCES collaborators(id) ON DELETE CASCADE,
  INDEX idx_okr_checkin_kr (keyResultId),
  INDEX idx_okr_checkin_author (authorId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
