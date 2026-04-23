-- Peso relativo de cada KPI dentro de un KR (cuando hay múltiples KPIs)
SET @dbname = DATABASE();
SET @preparedStatement = (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname
       AND TABLE_NAME = 'okr_kr_kpis'
       AND COLUMN_NAME = 'weight') > 0,
    'SELECT 1 -- columna ya existe',
    'ALTER TABLE okr_kr_kpis ADD COLUMN weight DECIMAL(5,4) NOT NULL DEFAULT 1.0000'
  )
);
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
