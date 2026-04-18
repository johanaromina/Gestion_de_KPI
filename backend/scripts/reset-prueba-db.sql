-- ==========================================================
-- Reset completo base "prueba"
-- Borra todos los datos operativos pero conserva:
--   · El usuario admin de ingreso (colaborador con role='admin')
--   · Las tablas de sistema: calendar_profiles, permissions,
--     roles, role_permissions
-- Ejecutar: mysql -u root -p prueba < reset-prueba-db.sql
-- ==========================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ── OKR ───────────────────────────────────────────────────
TRUNCATE TABLE okr_check_ins;
TRUNCATE TABLE okr_key_results;
TRUNCATE TABLE okr_objectives;

-- ── Check-ins operativos ──────────────────────────────────
TRUNCATE TABLE check_ins;

-- ── Mediciones e integraciones ────────────────────────────
TRUNCATE TABLE integration_template_runs;
TRUNCATE TABLE integration_targets;
TRUNCATE TABLE integration_templates;
TRUNCATE TABLE auth_profiles;
TRUNCATE TABLE integration_runs;
TRUNCATE TABLE integrations;

-- ── KPI datos ─────────────────────────────────────────────
TRUNCATE TABLE kpi_measurements;
TRUNCATE TABLE kpi_criteria_versions;
TRUNCATE TABLE scope_kpi_aggregation_runs;

-- ── Asignaciones y planes ─────────────────────────────────
TRUNCATE TABLE collaborator_kpi_plan;
TRUNCATE TABLE collaborator_kpis;

-- ── KPI scope ─────────────────────────────────────────────
TRUNCATE TABLE scope_kpi_links;
TRUNCATE TABLE scope_kpis;
TRUNCATE TABLE kpi_scope_weights;
TRUNCATE TABLE objective_trees_scope_kpis;
TRUNCATE TABLE objective_trees_kpis;
TRUNCATE TABLE objective_trees;

-- ── KPIs ──────────────────────────────────────────────────
TRUNCATE TABLE kpi_periods;
TRUNCATE TABLE kpi_areas;
TRUNCATE TABLE kpis;

-- ── Períodos y subperíodos ────────────────────────────────
TRUNCATE TABLE period_summary_items;
TRUNCATE TABLE period_summaries;
TRUNCATE TABLE calendar_subperiods;
TRUNCATE TABLE periods;

-- ── Organización ──────────────────────────────────────────
TRUNCATE TABLE data_source_mappings;
TRUNCATE TABLE org_scope_roles;
TRUNCATE TABLE collaborator_roles;
TRUNCATE TABLE collaborator_permissions;
TRUNCATE TABLE collaborator_events;

-- ── Notificaciones y auditoría ────────────────────────────
TRUNCATE TABLE notification_states;
TRUNCATE TABLE audit_logs;
TRUNCATE TABLE auth_handoff_codes;

-- ── Áreas legacy ─────────────────────────────────────────
TRUNCATE TABLE areas;

-- ── Colaboradores: borrar todos EXCEPTO el admin ──────────
-- Primero limpiar referencias a managerId de no-admin
UPDATE collaborators SET managerId = NULL WHERE role <> 'admin';
-- Borrar colaboradores no-admin
DELETE FROM collaborators WHERE role <> 'admin';
-- Desconectar el admin de su scope (el scope se va a borrar)
UPDATE collaborators SET orgScopeId = NULL WHERE role = 'admin';

-- ── Estructura organizacional ─────────────────────────────
TRUNCATE TABLE org_scopes;

SET FOREIGN_KEY_CHECKS = 1;

-- ==========================================================
-- Verificación
-- ==========================================================
SELECT
  'colaboradores restantes'       AS tabla, COUNT(*) AS registros FROM collaborators
UNION ALL SELECT 'org_scopes',              COUNT(*) FROM org_scopes
UNION ALL SELECT 'kpis',                    COUNT(*) FROM kpis
UNION ALL SELECT 'collaborator_kpis',       COUNT(*) FROM collaborator_kpis
UNION ALL SELECT 'kpi_measurements',        COUNT(*) FROM kpi_measurements
UNION ALL SELECT 'periods',                 COUNT(*) FROM periods
UNION ALL SELECT 'okr_objectives',          COUNT(*) FROM okr_objectives
UNION ALL SELECT 'integration_templates',   COUNT(*) FROM integration_templates;

SELECT
  CONCAT('✅ Reset completado. Usuario admin preservado: ', name, ' (', email, ')') AS resultado
FROM collaborators
WHERE role = 'admin'
LIMIT 1;
