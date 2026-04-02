-- Script para crear la base de datos y todas las tablas del sistema de Gestión de KPI

-- Crear la base de datos si no existe
CREATE DATABASE IF NOT EXISTS gestion_kpi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE gestion_kpi;

-- Tabla de Scopes Organizacionales
CREATE TABLE IF NOT EXISTS org_scopes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type ENUM('company', 'area', 'team', 'person', 'product') NOT NULL DEFAULT 'area',
  parentId INT NULL,
  calendarProfileId INT NULL,
  metadata TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parentId) REFERENCES org_scopes(id) ON DELETE SET NULL,
  INDEX idx_scope_type (type),
  INDEX idx_scope_parent (parentId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Colaboradores
CREATE TABLE IF NOT EXISTS collaborators (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  position VARCHAR(255) NOT NULL,
  area VARCHAR(255) NOT NULL,
  orgScopeId INT NULL,
  email VARCHAR(255) NULL,
  passwordHash VARCHAR(255) NULL,
  passwordResetTokenHash VARCHAR(64) NULL,
  passwordResetExpiresAt DATETIME NULL,
  mfaEnabled TINYINT(1) NOT NULL DEFAULT 0,
  mfaCodeHash VARCHAR(64) NULL,
  mfaCodeExpiresAt DATETIME NULL,
  ssoProviderId INT NULL,
  ssoSubject VARCHAR(255) NULL,
  authSource ENUM('local', 'sso') NOT NULL DEFAULT 'local',
  managerId INT NULL,
  role ENUM('admin', 'director', 'manager', 'leader', 'collaborator') NOT NULL DEFAULT 'collaborator',
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  inactiveReason VARCHAR(255) NULL,
  inactiveAt TIMESTAMP NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (managerId) REFERENCES collaborators(id) ON DELETE SET NULL,
  FOREIGN KEY (orgScopeId) REFERENCES org_scopes(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_collaborators_email (email),
  INDEX idx_collaborators_sso_provider (ssoProviderId),
  INDEX idx_collaborators_sso_subject (ssoSubject),
  INDEX idx_manager (managerId),
  INDEX idx_role (role),
  INDEX idx_status (status),
  INDEX idx_area (area),
  INDEX idx_collaborators_org_scope (orgScopeId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Eventos de colaborador (cambios de rol, desvinculaci¢n, reactivaci¢n)
CREATE TABLE IF NOT EXISTS collaborator_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collaboratorId INT NOT NULL,
  eventType ENUM('role_change', 'termination', 'reactivation') NOT NULL,
  oldValue VARCHAR(255) NULL,
  newValue VARCHAR(255) NULL,
  reason VARCHAR(255) NULL,
  createdBy INT NULL,
  createdByName VARCHAR(255) NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (collaboratorId) REFERENCES collaborators(id) ON DELETE CASCADE,
  INDEX idx_collaborator_event (collaboratorId, eventType),
  INDEX idx_event_type (eventType)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Períodos
CREATE TABLE IF NOT EXISTS periods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  startDate DATE NOT NULL,
  endDate DATE NOT NULL,
  status ENUM('open', 'in_review', 'closed') NOT NULL DEFAULT 'open',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_dates (startDate, endDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS areas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  parentId INT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_area_name (name),
  FOREIGN KEY (parentId) REFERENCES areas(id) ON DELETE SET NULL
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

-- Tabla de aliases / claves externas por fuente
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

-- Resúmenes anuales por periodo y colaborador
CREATE TABLE IF NOT EXISTS period_summaries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  periodId INT NOT NULL,
  collaboratorId INT NOT NULL,
  totalWeight DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  totalWeightedResult DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  overallResult DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status ENUM('open', 'closed') NOT NULL DEFAULT 'closed',
  generatedBy INT NULL,
  generatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_period_collaborator (periodId, collaboratorId),
  INDEX idx_period_summary_period (periodId),
  INDEX idx_period_summary_collaborator (collaboratorId),
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE,
  FOREIGN KEY (collaboratorId) REFERENCES collaborators(id) ON DELETE CASCADE,
  FOREIGN KEY (generatedBy) REFERENCES collaborators(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS period_summary_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  summaryId INT NOT NULL,
  kpiId INT NOT NULL,
  target DECIMAL(10,2) NULL,
  actual DECIMAL(10,2) NULL,
  variation DECIMAL(10,2) NULL,
  weight DECIMAL(10,2) NULL,
  weightedResult DECIMAL(10,2) NULL,
  status ENUM('draft', 'proposed', 'approved', 'closed') NOT NULL DEFAULT 'draft',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_summary_item_summary (summaryId),
  INDEX idx_summary_item_kpi (kpiId),
  UNIQUE KEY uniq_summary_kpi (summaryId, kpiId),
  FOREIGN KEY (summaryId) REFERENCES period_summaries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Calendarios de medición por scope
CREATE TABLE IF NOT EXISTS calendar_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  frequency ENUM('monthly', 'quarterly', 'custom') NOT NULL DEFAULT 'monthly',
  active TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_calendar_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO calendar_profiles (name, description, frequency, active)
VALUES ('Default', 'Calendario por defecto', 'monthly', 1);

-- Tabla de Subperíodos
CREATE TABLE IF NOT EXISTS calendar_subperiods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  periodId INT NOT NULL,
  calendarProfileId INT NULL,
  name VARCHAR(255) NOT NULL,
  startDate DATE NOT NULL,
  endDate DATE NOT NULL,
  status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  weight DECIMAL(5,2) DEFAULT 0.00,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE,
  FOREIGN KEY (calendarProfileId) REFERENCES calendar_profiles(id) ON DELETE SET NULL,
  INDEX idx_period (periodId),
  INDEX idx_dates (startDate, endDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de KPIs
CREATE TABLE IF NOT EXISTS kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type ENUM('manual', 'count', 'ratio', 'sla', 'value') NOT NULL DEFAULT 'value',
  direction ENUM('growth', 'reduction', 'exact') NOT NULL DEFAULT 'growth',
  criteria TEXT,
  formula TEXT NULL,
  defaultDataSource VARCHAR(100) NULL,
  defaultCriteriaTemplate TEXT NULL,
  defaultCalcRule TEXT NULL,
  macroKPIId INT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (macroKPIId) REFERENCES kpis(id) ON DELETE SET NULL,
  INDEX idx_type (type),
  INDEX idx_macro (macroKPIId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kpi_areas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kpiId INT NOT NULL,
  area VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_kpi_area (kpiId, area),
  FOREIGN KEY (kpiId) REFERENCES kpis(id) ON DELETE CASCADE,
  INDEX idx_area (area)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kpi_periods (
  kpiId INT NOT NULL,
  periodId INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kpiId, periodId),
  FOREIGN KEY (kpiId) REFERENCES kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ponderación de KPI por Scope
CREATE TABLE IF NOT EXISTS kpi_scope_weights (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kpiId INT NOT NULL,
  scopeId INT NOT NULL,
  weight DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_kpi_scope_weight (kpiId, scopeId),
  INDEX idx_kpi (kpiId),
  INDEX idx_scope (scopeId),
  FOREIGN KEY (kpiId) REFERENCES kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (scopeId) REFERENCES org_scopes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de KPIs de Colaboradores (relación muchos a muchos con períodos)
CREATE TABLE IF NOT EXISTS collaborator_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collaboratorId INT NOT NULL,
  kpiId INT NOT NULL,
  periodId INT NOT NULL,
  calendarProfileId INT NULL,
  subPeriodId INT NULL,
  target DECIMAL(10,2) NOT NULL,
  actual DECIMAL(10,2) NULL,
  weight DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  variation DECIMAL(10,2) NULL,
  weightedResult DECIMAL(10,2) NULL,
  status ENUM('draft', 'proposed', 'approved', 'closed') NOT NULL DEFAULT 'draft',
  comments TEXT,
  planValue DECIMAL(12,2) NULL,
  curationStatus ENUM('pending', 'in_review', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  dataSource VARCHAR(100) NULL,
  sourceConfig TEXT NULL,
  curatorUserId INT NULL,
  activeCriteriaVersionId INT NULL,
  inputMode ENUM('manual', 'import', 'auto') NOT NULL DEFAULT 'manual',
  lastMeasurementId INT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (collaboratorId) REFERENCES collaborators(id) ON DELETE CASCADE,
  FOREIGN KEY (kpiId) REFERENCES kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE,
  FOREIGN KEY (calendarProfileId) REFERENCES calendar_profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (subPeriodId) REFERENCES calendar_subperiods(id) ON DELETE SET NULL,
  FOREIGN KEY (curatorUserId) REFERENCES collaborators(id) ON DELETE SET NULL,
  INDEX idx_collaborator (collaboratorId),
  INDEX idx_period (periodId),
  INDEX idx_status (status),
  UNIQUE KEY unique_collaborator_kpi_period (collaboratorId, kpiId, periodId, subPeriodId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Criterios versionados por asignación
CREATE TABLE IF NOT EXISTS kpi_criteria_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignmentId INT NOT NULL,
  dataSource VARCHAR(100) NULL,
  sourceConfig TEXT NULL,
  criteriaText TEXT NULL,
  evidenceUrl TEXT NULL,
  status ENUM('pending', 'in_review', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  createdBy INT NULL,
  reviewedBy INT NULL,
  comment TEXT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewedAt TIMESTAMP NULL,
  FOREIGN KEY (assignmentId) REFERENCES collaborator_kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (createdBy) REFERENCES collaborators(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewedBy) REFERENCES collaborators(id) ON DELETE SET NULL,
  INDEX idx_assignment (assignmentId),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mediciones por asignación (input)
CREATE TABLE IF NOT EXISTS kpi_measurements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignmentId INT NULL,
  scopeKpiId INT NULL,
  periodId INT NULL,
  subPeriodId INT NULL,
  value DECIMAL(10,2) NOT NULL,
  mode ENUM('manual', 'import', 'auto') NOT NULL DEFAULT 'manual',
  status ENUM('draft', 'proposed', 'approved', 'rejected') NOT NULL DEFAULT 'draft',
  capturedBy INT NULL,
  capturedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  criteriaVersionId INT NULL,
  reason TEXT NULL,
  evidenceUrl TEXT NULL,
  sourceRunId VARCHAR(255) NULL,
  FOREIGN KEY (assignmentId) REFERENCES collaborator_kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE SET NULL,
  FOREIGN KEY (subPeriodId) REFERENCES calendar_subperiods(id) ON DELETE SET NULL,
  FOREIGN KEY (criteriaVersionId) REFERENCES kpi_criteria_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (capturedBy) REFERENCES collaborators(id) ON DELETE SET NULL,
  INDEX idx_assignment (assignmentId),
  INDEX idx_scope_kpi (scopeKpiId),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS collaborator_kpi_plan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collaboratorId INT NOT NULL,
  kpiId INT NOT NULL,
  periodId INT NOT NULL,
  subPeriodId INT NOT NULL,
  target DECIMAL(12,2) NOT NULL,
  weightOverride DECIMAL(6,2) NULL DEFAULT NULL,
  source VARCHAR(255) NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_plan (collaboratorId, kpiId, periodId, subPeriodId),
  FOREIGN KEY (collaboratorId) REFERENCES collaborators(id) ON DELETE CASCADE,
  FOREIGN KEY (kpiId) REFERENCES kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE,
  FOREIGN KEY (subPeriodId) REFERENCES calendar_subperiods(id) ON DELETE CASCADE,
  INDEX idx_plan_collab (collaboratorId, periodId),
  INDEX idx_plan_kpi (kpiId, periodId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE collaborator_kpis
  ADD CONSTRAINT fk_collab_kpis_criteria FOREIGN KEY (activeCriteriaVersionId) REFERENCES kpi_criteria_versions(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_collab_kpis_last_measurement FOREIGN KEY (lastMeasurementId) REFERENCES kpi_measurements(id) ON DELETE SET NULL;

-- Tabla de Árbol de Objetivos
CREATE TABLE IF NOT EXISTS objective_trees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  level ENUM('company', 'direction', 'management', 'leadership', 'individual') NOT NULL,
  name VARCHAR(255) NOT NULL,
  parentId INT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parentId) REFERENCES objective_trees(id) ON DELETE CASCADE,
  INDEX idx_level (level),
  INDEX idx_parent (parentId)
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

-- Tabla de relación entre Árbol de Objetivos y KPIs
CREATE TABLE IF NOT EXISTS objective_trees_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  objectiveTreeId INT NOT NULL,
  kpiId INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (objectiveTreeId) REFERENCES objective_trees(id) ON DELETE CASCADE,
  FOREIGN KEY (kpiId) REFERENCES kpis(id) ON DELETE CASCADE,
  UNIQUE KEY unique_objective_kpi (objectiveTreeId, kpiId),
  INDEX idx_objective (objectiveTreeId),
  INDEX idx_kpi (kpiId)
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

-- Tabla para estado de notificaciones
CREATE TABLE IF NOT EXISTS notification_states (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  entityKey VARCHAR(100) NOT NULL,
  stateHash VARCHAR(64) NOT NULL,
  lastNotifiedAt DATETIME NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_notification_state (type, entityKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Integraciones y ejecuciones
CREATE TABLE IF NOT EXISTS integrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type ENUM('jira', 'xray', 'db', 'excel', 'api', 'manual', 'generic_api', 'looker', 'other') NOT NULL DEFAULT 'api',
  endpoint TEXT NULL,
  assignmentId INT NULL,
  jql TEXT NULL,
  jqlTests TEXT NULL,
  jqlStories TEXT NULL,
  authType ENUM('none', 'basic', 'bearer', 'apiKey') NOT NULL DEFAULT 'none',
  authConfig TEXT NULL,
  status ENUM('active', 'inactive', 'error') NOT NULL DEFAULT 'inactive',
  schedule VARCHAR(100) NULL,
  lastRunAt DATETIME NULL,
  lastRunStatus ENUM('success', 'error', 'running') NULL,
  lastRunMessage TEXT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_integration_name (name),
  INDEX idx_assignment (assignmentId),
  CONSTRAINT fk_integration_assignment FOREIGN KEY (assignmentId) REFERENCES collaborator_kpis(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integration_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  integrationId INT NOT NULL,
  status ENUM('success', 'error', 'running') NOT NULL DEFAULT 'running',
  startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  finishedAt DATETIME NULL,
  triggeredBy INT NULL,
  message TEXT NULL,
  itemsProcessed INT NOT NULL DEFAULT 0,
  errorCount INT NOT NULL DEFAULT 0,
  meta TEXT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (integrationId) REFERENCES integrations(id) ON DELETE CASCADE,
  FOREIGN KEY (triggeredBy) REFERENCES collaborators(id) ON DELETE SET NULL,
  INDEX idx_integration (integrationId),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Integraciones escalables (plantillas, targets, auth profiles)
CREATE TABLE IF NOT EXISTS auth_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  connector ENUM('jira', 'xray', 'sheets', 'azure_devops', 'github', 'servicenow', 'zendesk', 'generic_api', 'looker', 'other') NOT NULL DEFAULT 'jira',
  endpoint TEXT NULL,
  authType ENUM('none', 'basic', 'bearer', 'apiKey') NOT NULL DEFAULT 'none',
  authConfig TEXT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_auth_profile_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integration_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  connector ENUM('jira', 'xray', 'sheets', 'azure_devops', 'github', 'servicenow', 'zendesk', 'generic_api', 'looker', 'other') NOT NULL DEFAULT 'jira',
  metricType ENUM('count', 'ratio') NOT NULL DEFAULT 'ratio',
  metricTypeUi VARCHAR(20) NULL,
  queryTestsTemplate TEXT NULL,
  queryStoriesTemplate TEXT NULL,
  formulaTemplate VARCHAR(255) NULL,
  schedule VARCHAR(100) NULL,
  authProfileId INT NULL,
  isSpecific TINYINT(1) NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (authProfileId) REFERENCES auth_profiles(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_template_name (name),
  INDEX idx_template_connector (connector)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integration_targets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  templateId INT NOT NULL,
  scopeType ENUM('company', 'area', 'team', 'person', 'product') NOT NULL DEFAULT 'area',
  scopeId VARCHAR(255) NOT NULL,
  orgScopeId INT NULL,
  params TEXT NULL,
  assignmentId INT NULL,
  scopeKpiId INT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (templateId) REFERENCES integration_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (assignmentId) REFERENCES collaborator_kpis(id) ON DELETE SET NULL,
  INDEX idx_target_template (templateId),
  INDEX idx_target_scope (scopeType, scopeId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integration_template_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  templateId INT NOT NULL,
  targetId INT NOT NULL,
  status ENUM('success', 'error', 'running') NOT NULL DEFAULT 'running',
  startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  finishedAt DATETIME NULL,
  triggeredBy INT NULL,
  message TEXT NULL,
  outputs TEXT NULL,
  error TEXT NULL,
  archived TINYINT(1) NOT NULL DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (templateId) REFERENCES integration_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (targetId) REFERENCES integration_targets(id) ON DELETE CASCADE,
  FOREIGN KEY (triggeredBy) REFERENCES collaborators(id) ON DELETE SET NULL,
  INDEX idx_template_run (templateId, targetId),
  INDEX idx_run_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_scopes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type ENUM('company', 'area', 'team', 'person', 'product') NOT NULL DEFAULT 'area',
  parentId INT NULL,
  calendarProfileId INT NULL,
  metadata TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parentId) REFERENCES org_scopes(id) ON DELETE SET NULL,
  FOREIGN KEY (calendarProfileId) REFERENCES calendar_profiles(id) ON DELETE SET NULL,
  INDEX idx_scope_type (type),
  INDEX idx_scope_parent (parentId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE integration_targets
  ADD CONSTRAINT fk_target_org_scope
  FOREIGN KEY (orgScopeId) REFERENCES org_scopes(id) ON DELETE SET NULL;

ALTER TABLE org_scopes
  ADD CONSTRAINT fk_org_scopes_calendar_profile
  FOREIGN KEY (calendarProfileId) REFERENCES calendar_profiles(id) ON DELETE SET NULL;

ALTER TABLE scope_kpis
  ADD CONSTRAINT fk_scope_kpis_org_scope
  FOREIGN KEY (orgScopeId) REFERENCES org_scopes(id) ON DELETE CASCADE;

ALTER TABLE period_summary_items
  ADD CONSTRAINT fk_period_summary_items_kpi
  FOREIGN KEY (kpiId) REFERENCES kpis(id) ON DELETE CASCADE;

ALTER TABLE kpi_measurements
  ADD CONSTRAINT fk_measurements_scope_kpi
  FOREIGN KEY (scopeKpiId) REFERENCES scope_kpis(id) ON DELETE CASCADE;

ALTER TABLE integration_targets
  ADD CONSTRAINT fk_target_scope_kpi
  FOREIGN KEY (scopeKpiId) REFERENCES scope_kpis(id) ON DELETE SET NULL;

-- Permisos y superpoderes
ALTER TABLE collaborators
ADD COLUMN hasSuperpowers TINYINT(1) NOT NULL DEFAULT 0 AFTER role;

CREATE TABLE IF NOT EXISTS permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  editable TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
  roleId INT NOT NULL,
  permissionId INT NOT NULL,
  PRIMARY KEY (roleId, permissionId),
  CONSTRAINT fk_role_permission_role FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permission_permission FOREIGN KEY (permissionId) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collaborator_permissions (
  collaboratorId INT NOT NULL,
  permissionId INT NOT NULL,
  PRIMARY KEY (collaboratorId, permissionId),
  CONSTRAINT fk_cp_collaborator FOREIGN KEY (collaboratorId) REFERENCES collaborators(id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_permission FOREIGN KEY (permissionId) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entityType VARCHAR(64) NOT NULL,
  entityId INT NOT NULL,
  action VARCHAR(16) NOT NULL,
  userId INT NULL,
  userName VARCHAR(120) NULL,
  oldValues JSON NULL,
  newValues JSON NULL,
  changes JSON NULL,
  ipAddress VARCHAR(64) NULL,
  userAgent VARCHAR(255) NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_entity (entityType, entityId),
  INDEX idx_audit_user (userId),
  INDEX idx_audit_created (createdAt),
  FOREIGN KEY (userId) REFERENCES collaborators(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS collaborator_roles (
  collaboratorId INT NOT NULL PRIMARY KEY,
  roleId INT NOT NULL,
  assignedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cr_collaborator FOREIGN KEY (collaboratorId) REFERENCES collaborators(id) ON DELETE CASCADE,
  CONSTRAINT fk_cr_role FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS org_scope_roles (
  orgScopeId INT NOT NULL PRIMARY KEY,
  roleId INT NOT NULL,
  assignedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_osr_scope FOREIGN KEY (orgScopeId) REFERENCES org_scopes(id) ON DELETE CASCADE,
  CONSTRAINT fk_osr_role FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE RESTRICT
);

INSERT IGNORE INTO permissions (code, description) VALUES
('config.manage', 'Gestionar roles, permisos y superpoderes'),
('config.view', 'Ver sección de configuración'),
('view_dashboard', 'Ver dashboard'),
('view_reports', 'Ver reportes y vistas agregadas'),
('view_audit', 'Ver auditoria'),
('kpi_read', 'Ver KPIs'),
('kpi_create', 'Crear KPIs'),
('kpi_update', 'Editar KPIs'),
('kpi_delete', 'Eliminar KPIs'),
('assignment_read', 'Ver asignaciones'),
('assignment_create', 'Crear asignaciones'),
('assignment_update', 'Editar asignaciones'),
('assignment_close', 'Cerrar asignaciones'),
('curation_read', 'Ver curaduria'),
('curation_submit', 'Proponer curaduria'),
('curation_review', 'Aprobar/Rechazar curaduria'),
('curation_edit', 'Editar criterio en borrador'),
('measurement_read', 'Ver mediciones'),
('measurement_create_manual', 'Cargar mediciones manuales'),
('measurement_import', 'Importar mediciones'),
('measurement_run_ingest', 'Ejecutar ingestas'),
('measurement_approve', 'Aprobar mediciones');

INSERT IGNORE INTO roles (code, name, description, editable) VALUES
('admin', 'Admin', 'Acceso total', 0),
('data_curator', 'Data Curator', 'Aprueba criterios y datos', 0),
('producer', 'Producer', 'Carga e ingesta de datos', 0),
('viewer', 'Viewer', 'Solo lectura', 0),
('leader', 'Leader/Manager', 'Aprueba y gestiona KPIs', 0);

INSERT IGNORE INTO role_permissions (roleId, permissionId)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'config.manage','config.view','kpi_read','kpi_create','kpi_update','kpi_delete','assignment_read','assignment_create',
  'assignment_update','assignment_close','curation_read','curation_submit','curation_review','curation_edit',
  'measurement_read','measurement_create_manual','measurement_import','measurement_run_ingest','measurement_approve',
  'view_dashboard','view_reports','view_audit'
) WHERE r.code = 'admin';

INSERT IGNORE INTO role_permissions (roleId, permissionId)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'config.manage','config.view','kpi_read','assignment_read','curation_read','curation_review','curation_edit',
  'measurement_read','measurement_run_ingest','view_dashboard','view_reports','view_audit'
) WHERE r.code = 'data_curator';

INSERT IGNORE INTO role_permissions (roleId, permissionId)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'kpi_read','assignment_read','curation_submit','measurement_read','measurement_create_manual','measurement_import',
  'measurement_run_ingest','view_dashboard','view_reports'
) WHERE r.code = 'producer';

INSERT IGNORE INTO role_permissions (roleId, permissionId)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'view_dashboard','view_reports','kpi_read','assignment_read','measurement_read'
) WHERE r.code = 'viewer';

INSERT IGNORE INTO role_permissions (roleId, permissionId)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'config.manage','config.view','kpi_read','assignment_read','assignment_create','assignment_update','assignment_close',
  'curation_submit','measurement_read','measurement_run_ingest','measurement_approve','view_dashboard','view_reports'
) WHERE r.code = 'leader';

