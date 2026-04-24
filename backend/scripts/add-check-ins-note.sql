-- Agrega columna `note` a check_ins (comentario del líder).
-- Idempotente: no falla si ya existe.

SET @db   = DATABASE();
SET @tbl  = 'check_ins';
SET @col  = 'note';

SET @sql = (
  SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @db
       AND TABLE_NAME   = @tbl
       AND COLUMN_NAME  = @col) > 0,
    'SELECT ''columna note ya existe, sin cambios'' AS info',
    'ALTER TABLE check_ins ADD COLUMN note TEXT NULL COMMENT ''Comentario del líder sobre el check-in'''
  )
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
