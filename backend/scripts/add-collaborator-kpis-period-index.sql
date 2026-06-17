-- Índice compuesto para acelerar queries filtradas por período en collaborator_kpis.
-- Con 30k+ colaboradores, las queries de estadísticas por área y período
-- pasan de escanear millones de filas a un rango acotado por periodId.
SET @cnt = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'collaborator_kpis'
    AND INDEX_NAME   = 'idx_period_collaborator'
);
SET @sql = IF(
  @cnt = 0,
  'ALTER TABLE collaborator_kpis ADD INDEX idx_period_collaborator (periodId, collaboratorId)',
  'SELECT ''idx_period_collaborator already exists, skipping'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
