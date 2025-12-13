-- Script para agregar campo formula a la tabla kpis
-- Ejecutar este script después de crear la base de datos inicial

USE gestion_kpi;

-- Agregar campo formula a la tabla kpis
ALTER TABLE kpis 
ADD COLUMN IF NOT EXISTS formula TEXT NULL 
AFTER criteria;

-- Actualizar KPIs existentes con fórmulas por defecto según su tipo
UPDATE kpis 
SET formula = '(actual / target) * 100' 
WHERE type = 'growth' AND (formula IS NULL OR formula = '');

UPDATE kpis 
SET formula = '(target / actual) * 100' 
WHERE type = 'reduction' AND (formula IS NULL OR formula = '');

UPDATE kpis 
SET formula = '100 - (Math.abs(actual - target) / target) * 100' 
WHERE type = 'exact' AND (formula IS NULL OR formula = '');

