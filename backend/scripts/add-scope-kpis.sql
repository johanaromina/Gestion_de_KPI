USE gestion_kpi;

-- Migracion canonica del dominio scope.
-- Incluye:
-- 1. scope_kpis + links + aggregation runs
-- 2. supporto de scopeKpiId en measurements y integration_targets
-- 3. data_source_mappings
-- 4. scopeType = company en integration_targets
-- 5. enums de conectores actuales (generic_api, looker)
-- 6. base SSO enterprise (providers + handoff codes)

CREATE TABLE IF NOT EXISTS data_source_mappings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sourceType VARCHAR(50) NOT NULL DEFAULT 'global',
  entityType ENUM('collaborator', 'org_scope') NOT NULL,
  entityId INT NOT NULL,
  externalKey VARCHAR(255) NOT NULL,
  normalizedKey VARCHAR(255) NOT NULL,
  externalLabel VARCHAR(255) NULL,
  metadata TEXT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_data_source_mapping (sourceType, entityType, normalizedKey),
  INDEX idx_data_source_mapping_entity (entityType, entityId),
  INDEX idx_data_source_mapping_source (sourceType)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sso_providers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  providerType ENUM('oidc') NOT NULL DEFAULT 'oidc',
  issuer VARCHAR(255) NULL,
  clientId VARCHAR(255) NOT NULL,
  clientSecret TEXT NULL,
  authorizationEndpoint VARCHAR(500) NOT NULL,
  tokenEndpoint VARCHAR(500) NOT NULL,
  userInfoEndpoint VARCHAR(500) NOT NULL,
  scopes VARCHAR(500) NULL,
  allowedDomains VARCHAR(500) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_sso_provider_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_handoff_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codeHash VARCHAR(64) NOT NULL,
  collaboratorId INT NOT NULL,
  ssoProviderId INT NULL,
  expiresAt DATETIME NOT NULL,
  consumedAt DATETIME NULL,
  metadata TEXT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_auth_handoff_code_hash (codeHash),
  INDEX idx_auth_handoff_collaborator (collaboratorId),
  INDEX idx_auth_handoff_provider (ssoProviderId),
  INDEX idx_auth_handoff_expires (expiresAt),
  FOREIGN KEY (collaboratorId) REFERENCES collaborators(id) ON DELETE CASCADE,
  FOREIGN KEY (ssoProviderId) REFERENCES sso_providers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scope_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  kpiId INT NOT NULL,
  orgScopeId INT NOT NULL,
  periodId INT NOT NULL,
  subPeriodId INT NULL,
  ownerLevel ENUM('team', 'area', 'business_unit', 'company', 'executive') NOT NULL DEFAULT 'area',
  sourceMode ENUM('direct', 'aggregated', 'mixed') NOT NULL DEFAULT 'direct',
  target DECIMAL(12,2) NOT NULL DEFAULT 0,
  actual DECIMAL(12,2) NULL,
  directActual DECIMAL(12,2) NULL,
  aggregatedActual DECIMAL(12,2) NULL,
  mixedConfig TEXT NULL,
  weight DECIMAL(8,2) NOT NULL DEFAULT 0,
  variation DECIMAL(10,2) NULL,
  weightedResult DECIMAL(10,2) NULL,
  status ENUM('draft', 'proposed', 'approved', 'closed') NOT NULL DEFAULT 'draft',
  inputMode ENUM('manual', 'import', 'auto') NOT NULL DEFAULT 'manual',
  curationStatus ENUM('pending', 'in_review', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  lastMeasurementId INT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (kpiId) REFERENCES kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (orgScopeId) REFERENCES org_scopes(id) ON DELETE CASCADE,
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE,
  FOREIGN KEY (subPeriodId) REFERENCES calendar_subperiods(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_scope_kpi (kpiId, orgScopeId, periodId, subPeriodId),
  INDEX idx_scope_scope_period (orgScopeId, periodId),
  INDEX idx_scope_period (periodId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scope_kpi_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scopeKpiId INT NOT NULL,
  childType ENUM('collaborator', 'scope') NOT NULL,
  collaboratorAssignmentId INT NULL,
  childScopeKpiId INT NULL,
  contributionWeight DECIMAL(8,2) NULL,
  aggregationMethod ENUM('sum', 'avg', 'weighted_avg') NOT NULL DEFAULT 'weighted_avg',
  formulaConfig TEXT NULL,
  sortOrder INT NOT NULL DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scopeKpiId) REFERENCES scope_kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (collaboratorAssignmentId) REFERENCES collaborator_kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (childScopeKpiId) REFERENCES scope_kpis(id) ON DELETE CASCADE,
  INDEX idx_scope_link_parent (scopeKpiId),
  INDEX idx_scope_link_child_collab (collaboratorAssignmentId),
  INDEX idx_scope_link_child_scope (childScopeKpiId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scope_kpi_aggregation_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scopeKpiId INT NOT NULL,
  periodId INT NOT NULL,
  subPeriodId INT NULL,
  status ENUM('success', 'error') NOT NULL DEFAULT 'success',
  inputsSnapshot LONGTEXT NULL,
  resultValue DECIMAL(12,2) NULL,
  message TEXT NULL,
  createdBy INT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scopeKpiId) REFERENCES scope_kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE,
  FOREIGN KEY (subPeriodId) REFERENCES calendar_subperiods(id) ON DELETE SET NULL,
  FOREIGN KEY (createdBy) REFERENCES collaborators(id) ON DELETE SET NULL,
  INDEX idx_scope_aggregation_parent (scopeKpiId, periodId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS objective_trees_scope_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  objectiveTreeId INT NOT NULL,
  scopeKpiId INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (objectiveTreeId) REFERENCES objective_trees(id) ON DELETE CASCADE,
  FOREIGN KEY (scopeKpiId) REFERENCES scope_kpis(id) ON DELETE CASCADE,
  UNIQUE KEY unique_objective_scope_kpi (objectiveTreeId, scopeKpiId),
  INDEX idx_objective_scope (objectiveTreeId),
  INDEX idx_scope_kpi_objective (scopeKpiId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE kpi_measurements
  MODIFY COLUMN assignmentId INT NULL;

ALTER TABLE integration_targets
  MODIFY COLUMN scopeType ENUM('company', 'area', 'team', 'person', 'product') NOT NULL DEFAULT 'area';

ALTER TABLE auth_profiles
  MODIFY COLUMN connector ENUM('jira', 'xray', 'sheets', 'azure_devops', 'github', 'servicenow', 'zendesk', 'generic_api', 'looker', 'other')
  NOT NULL DEFAULT 'jira';

ALTER TABLE integration_templates
  MODIFY COLUMN connector ENUM('jira', 'xray', 'sheets', 'azure_devops', 'github', 'servicenow', 'zendesk', 'generic_api', 'looker', 'other')
  NOT NULL DEFAULT 'jira';

ALTER TABLE integrations
  MODIFY COLUMN type ENUM('jira', 'xray', 'db', 'excel', 'api', 'manual', 'generic_api', 'looker', 'other')
  NOT NULL DEFAULT 'api';

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'collaborators' AND column_name = 'ssoProviderId') = 0,
  'ALTER TABLE collaborators ADD COLUMN ssoProviderId INT NULL AFTER mfaCodeExpiresAt',
  'SELECT ''collaborators.ssoProviderId ya existe'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'collaborators' AND column_name = 'ssoSubject') = 0,
  'ALTER TABLE collaborators ADD COLUMN ssoSubject VARCHAR(255) NULL AFTER ssoProviderId',
  'SELECT ''collaborators.ssoSubject ya existe'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'collaborators' AND column_name = 'authSource') = 0,
  'ALTER TABLE collaborators ADD COLUMN authSource ENUM(''local'', ''sso'') NOT NULL DEFAULT ''local'' AFTER ssoSubject',
  'SELECT ''collaborators.authSource ya existe'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'collaborators' AND index_name = 'idx_collaborators_sso_provider') = 0,
  'ALTER TABLE collaborators ADD INDEX idx_collaborators_sso_provider (ssoProviderId)',
  'SELECT ''idx_collaborators_sso_provider ya existe'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'collaborators' AND index_name = 'idx_collaborators_sso_subject') = 0,
  'ALTER TABLE collaborators ADD INDEX idx_collaborators_sso_subject (ssoSubject)',
  'SELECT ''idx_collaborators_sso_subject ya existe'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'kpi_measurements' AND column_name = 'scopeKpiId') = 0,
  'ALTER TABLE kpi_measurements ADD COLUMN scopeKpiId INT NULL AFTER assignmentId',
  'SELECT ''kpi_measurements.scopeKpiId ya existe'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'scope_kpis' AND column_name = 'directActual') = 0,
  'ALTER TABLE scope_kpis ADD COLUMN directActual DECIMAL(12,2) NULL AFTER actual',
  'SELECT ''scope_kpis.directActual ya existe'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'scope_kpis' AND column_name = 'aggregatedActual') = 0,
  'ALTER TABLE scope_kpis ADD COLUMN aggregatedActual DECIMAL(12,2) NULL AFTER directActual',
  'SELECT ''scope_kpis.aggregatedActual ya existe'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'scope_kpis' AND column_name = 'mixedConfig') = 0,
  'ALTER TABLE scope_kpis ADD COLUMN mixedConfig TEXT NULL AFTER aggregatedActual',
  'SELECT ''scope_kpis.mixedConfig ya existe'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE scope_kpis
SET directActual = COALESCE(directActual, actual)
WHERE sourceMode = 'direct' AND actual IS NOT NULL;

UPDATE scope_kpis
SET aggregatedActual = COALESCE(aggregatedActual, actual)
WHERE sourceMode = 'aggregated' AND actual IS NOT NULL;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'kpi_measurements' AND index_name = 'idx_scope_kpi') = 0,
  'ALTER TABLE kpi_measurements ADD INDEX idx_scope_kpi (scopeKpiId)',
  'SELECT ''idx_scope_kpi ya existe'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'kpi_measurements' AND constraint_name = 'fk_measurement_scope_kpi') = 0,
  'ALTER TABLE kpi_measurements ADD CONSTRAINT fk_measurement_scope_kpi FOREIGN KEY (scopeKpiId) REFERENCES scope_kpis(id) ON DELETE CASCADE',
  'SELECT ''fk_measurement_scope_kpi ya existe'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'integration_targets' AND column_name = 'scopeKpiId') = 0,
  'ALTER TABLE integration_targets ADD COLUMN scopeKpiId INT NULL AFTER assignmentId',
  'SELECT ''integration_targets.scopeKpiId ya existe'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'integration_targets' AND index_name = 'idx_target_scope_kpi') = 0,
  'ALTER TABLE integration_targets ADD INDEX idx_target_scope_kpi (scopeKpiId)',
  'SELECT ''idx_target_scope_kpi ya existe'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'integration_targets' AND constraint_name = 'fk_integration_target_scope_kpi') = 0,
  'ALTER TABLE integration_targets ADD CONSTRAINT fk_integration_target_scope_kpi FOREIGN KEY (scopeKpiId) REFERENCES scope_kpis(id) ON DELETE SET NULL',
  'SELECT ''fk_integration_target_scope_kpi ya existe'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
