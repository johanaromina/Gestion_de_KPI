SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE kpi_measurements;
TRUNCATE TABLE kpi_criteria_versions;
TRUNCATE TABLE collaborator_kpis;
TRUNCATE TABLE collaborator_kpi_plan;
TRUNCATE TABLE kpi_areas;
TRUNCATE TABLE kpis;

TRUNCATE TABLE integration_template_runs;
TRUNCATE TABLE integration_targets;
TRUNCATE TABLE integration_templates;
TRUNCATE TABLE auth_profiles;
TRUNCATE TABLE integrations;
TRUNCATE TABLE integration_runs;

TRUNCATE TABLE org_scopes;
TRUNCATE TABLE areas;
TRUNCATE TABLE collaborators;

SET FOREIGN_KEY_CHECKS = 1;
