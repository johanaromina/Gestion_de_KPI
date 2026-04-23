-- Peso relativo de cada KPI dentro de un KR (cuando hay múltiples KPIs)
ALTER TABLE okr_kr_kpis ADD COLUMN IF NOT EXISTS weight DECIMAL(5,4) NOT NULL DEFAULT 1.0000;
