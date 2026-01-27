-- Curaduria y mediciones (criterios versionados + measurements)

ALTER TABLE kpis
  ADD COLUMN defaultDataSource VARCHAR(100) NULL,
  ADD COLUMN defaultCriteriaTemplate TEXT NULL,
  ADD COLUMN defaultCalcRule TEXT NULL;

ALTER TABLE collaborator_kpis
  ADD COLUMN curationStatus ENUM('pending', 'in_review', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  ADD COLUMN dataSource VARCHAR(100) NULL,
  ADD COLUMN sourceConfig TEXT NULL,
  ADD COLUMN curatorUserId INT NULL,
  ADD COLUMN activeCriteriaVersionId INT NULL,
  ADD COLUMN inputMode ENUM('manual', 'import', 'auto') NOT NULL DEFAULT 'manual',
  ADD COLUMN lastMeasurementId INT NULL;

CREATE TABLE IF NOT EXISTS kpi_criteria_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignmentId INT NOT NULL,
  dataSource VARCHAR(100) NULL,
  sourceConfig TEXT NULL,
  criteriaText TEXT NULL,
  evidenceUrl TEXT NULL,
  status ENUM('pending', 'in_review', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  createdBy INT NULL,
  reviewedBy INT NULL,
  comment TEXT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewedAt TIMESTAMP NULL,
  FOREIGN KEY (assignmentId) REFERENCES collaborator_kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (createdBy) REFERENCES collaborators(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewedBy) REFERENCES collaborators(id) ON DELETE SET NULL,
  INDEX idx_assignment (assignmentId),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kpi_measurements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignmentId INT NOT NULL,
  periodId INT NULL,
  subPeriodId INT NULL,
  value DECIMAL(10,2) NOT NULL,
  mode ENUM('manual', 'import', 'auto') NOT NULL DEFAULT 'manual',
  status ENUM('draft', 'proposed', 'approved', 'rejected') NOT NULL DEFAULT 'draft',
  capturedBy INT NULL,
  capturedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  criteriaVersionId INT NULL,
  reason TEXT NULL,
  evidenceUrl TEXT NULL,
  sourceRunId VARCHAR(255) NULL,
  FOREIGN KEY (assignmentId) REFERENCES collaborator_kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE SET NULL,
  FOREIGN KEY (subPeriodId) REFERENCES sub_periods(id) ON DELETE SET NULL,
  FOREIGN KEY (criteriaVersionId) REFERENCES kpi_criteria_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (capturedBy) REFERENCES collaborators(id) ON DELETE SET NULL,
  INDEX idx_assignment (assignmentId),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE collaborator_kpis
  ADD CONSTRAINT fk_collab_kpis_curator FOREIGN KEY (curatorUserId) REFERENCES collaborators(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_collab_kpis_criteria FOREIGN KEY (activeCriteriaVersionId) REFERENCES kpi_criteria_versions(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_collab_kpis_last_measurement FOREIGN KEY (lastMeasurementId) REFERENCES kpi_measurements(id) ON DELETE SET NULL;
