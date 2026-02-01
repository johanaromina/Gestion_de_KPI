ALTER TABLE kpis
  ADD COLUMN direction ENUM('growth', 'reduction', 'exact') NOT NULL DEFAULT 'growth';

ALTER TABLE kpis
  MODIFY COLUMN type ENUM('growth', 'reduction', 'exact', 'manual', 'count', 'ratio', 'sla', 'value') NOT NULL DEFAULT 'value';

UPDATE kpis
  SET direction = type
  WHERE type IN ('growth', 'reduction', 'exact') AND (direction IS NULL OR direction = '');

UPDATE kpis
  SET type = 'value'
  WHERE type IN ('growth', 'reduction', 'exact');

ALTER TABLE kpis
  MODIFY COLUMN type ENUM('manual', 'count', 'ratio', 'sla', 'value') NOT NULL DEFAULT 'value';
