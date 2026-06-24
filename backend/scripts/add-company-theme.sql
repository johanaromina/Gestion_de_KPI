-- Tema visual por empresa (org_scope de tipo 'company').
-- Valores válidos: navy-teal | orange | indigo | emerald
ALTER TABLE org_scopes
  ADD COLUMN IF NOT EXISTS theme VARCHAR(20) NOT NULL DEFAULT 'navy-teal';
