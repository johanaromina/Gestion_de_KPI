-- Índice compuesto para acelerar queries filtradas por período en collaborator_kpis.
-- Con 30k+ colaboradores, las queries de estadísticas por área y período
-- pasan de escanear millones de filas a un rango acotado por periodId.
ALTER TABLE collaborator_kpis
  ADD INDEX idx_period_collaborator (periodId, collaboratorId);
