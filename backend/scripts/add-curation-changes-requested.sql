-- Agrega el estado 'changes_requested' a los ENUMs de curaduria

ALTER TABLE collaborator_kpis
  MODIFY COLUMN curationStatus ENUM('pending', 'in_review', 'approved', 'rejected', 'changes_requested') NOT NULL DEFAULT 'pending';

ALTER TABLE kpi_criteria_versions
  MODIFY COLUMN status ENUM('pending', 'in_review', 'approved', 'rejected', 'changes_requested') NOT NULL DEFAULT 'pending';
