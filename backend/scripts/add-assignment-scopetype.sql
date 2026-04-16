-- Amplía el ENUM scopeType en integration_targets para soportar
-- targets vinculados a asignaciones individuales (collaborator_kpi)
-- y KPIs grupales (scope_kpi), que usa el Sheets Wizard y similares.

ALTER TABLE integration_targets
  MODIFY COLUMN scopeType
    ENUM('company','area','team','person','product','assignment','scope_kpi')
    NOT NULL DEFAULT 'area';
