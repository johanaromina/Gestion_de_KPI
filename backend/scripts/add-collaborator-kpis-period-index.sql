-- Índice compuesto para acelerar queries filtradas por período en collaborator_kpis.
-- Con 30k+ colaboradores, las queries de estadísticas por área y período
-- pasan de escanear millones de filas a un rango acotado por periodId.
CREATE INDEX IF NOT EXISTS idx_period_collaborator ON collaborator_kpis (periodId, collaboratorId);
