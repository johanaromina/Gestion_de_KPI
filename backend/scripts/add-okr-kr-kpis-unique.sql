-- Constraint único para evitar KPIs duplicados en un mismo KR
-- Primero eliminar duplicados si existen (conservar el de menor id)
DELETE t1 FROM okr_kr_kpis t1
  INNER JOIN okr_kr_kpis t2
  WHERE t1.id > t2.id
    AND t1.krId = t2.krId
    AND (t1.collaboratorKpiId = t2.collaboratorKpiId OR (t1.collaboratorKpiId IS NULL AND t2.collaboratorKpiId IS NULL))
    AND (t1.scopeKpiId = t2.scopeKpiId OR (t1.scopeKpiId IS NULL AND t2.scopeKpiId IS NULL));

-- Agregar constraints únicos (NULL != NULL en MySQL, así que funcionan correctamente para cada tipo)
SET @preparedStatement = (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'okr_kr_kpis' AND INDEX_NAME = 'uq_kr_collab') > 0,
    'SELECT 1 -- índice uq_kr_collab ya existe',
    'ALTER TABLE okr_kr_kpis ADD UNIQUE KEY uq_kr_collab (krId, collaboratorKpiId)'
  )
);
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @preparedStatement = (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'okr_kr_kpis' AND INDEX_NAME = 'uq_kr_scope') > 0,
    'SELECT 1 -- índice uq_kr_scope ya existe',
    'ALTER TABLE okr_kr_kpis ADD UNIQUE KEY uq_kr_scope (krId, scopeKpiId)'
  )
);
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
