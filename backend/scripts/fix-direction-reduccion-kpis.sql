-- ============================================================
-- Corrige la dirección de KPIs de reducción mal configurados
-- como "crecimiento" y recalcula sus variaciones almacenadas.
--
-- KPIs afectados: Tiempo no productivo, Ausentismo no programado
--
-- Ejecutar en la base de datos de producción:
--   mysql -u <usuario> -p <base_datos> < fix-direction-reduccion-kpis.sql
-- ============================================================

-- Paso 1: Mostrar qué KPIs se van a corregir (verificación previa)
SELECT id, name, direction
FROM kpis
WHERE name IN ('Tiempo no productivo', 'Ausentismo no programado')
   OR name LIKE '%tiempo no productivo%'
   OR name LIKE '%ausentismo no programado%';

-- Paso 2: Actualizar la dirección a 'reduction'
UPDATE kpis
SET direction = 'reduction'
WHERE name IN ('Tiempo no productivo', 'Ausentismo no programado')
   OR name LIKE '%tiempo no productivo%'
   OR name LIKE '%ausentismo no programado%';

-- Paso 3: Recalcular variation y weightedResult en todas las asignaciones
-- de estos KPIs usando la fórmula de reducción: (target / actual) * 100
UPDATE collaborator_kpis ck
JOIN kpis k ON ck.kpiId = k.id
SET
  ck.variation = CASE
    WHEN ck.actual IS NULL OR ck.actual <= 0 THEN 0
    WHEN ck.target IS NULL OR ck.target <= 0 THEN 0
    ELSE ROUND((ck.target / ck.actual) * 100, 6)
  END,
  ck.weightedResult = CASE
    WHEN ck.actual IS NULL OR ck.actual <= 0 THEN 0
    WHEN ck.target IS NULL OR ck.target <= 0 THEN 0
    ELSE ROUND(((ck.target / ck.actual) * 100 * ck.weight) / 100, 6)
  END
WHERE k.name IN ('Tiempo no productivo', 'Ausentismo no programado')
   OR k.name LIKE '%tiempo no productivo%'
   OR k.name LIKE '%ausentismo no programado%';

-- Paso 4: Verificar el resultado
SELECT
  k.name AS kpi_name,
  k.direction,
  ck.target,
  ck.actual,
  ck.variation,
  ck.weightedResult,
  ck.weight
FROM collaborator_kpis ck
JOIN kpis k ON ck.kpiId = k.id
WHERE k.name IN ('Tiempo no productivo', 'Ausentismo no programado')
   OR k.name LIKE '%tiempo no productivo%'
   OR k.name LIKE '%ausentismo no programado%'
ORDER BY k.name, ck.id;
