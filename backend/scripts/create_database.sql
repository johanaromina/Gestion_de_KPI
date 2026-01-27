-- Script para crear la base de datos y todas las tablas del sistema de Gestión de KPI

-- Crear la base de datos si no existe
CREATE DATABASE IF NOT EXISTS gestion_kpi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE gestion_kpi;

-- Tabla de Colaboradores
CREATE TABLE IF NOT EXISTS collaborators (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  position VARCHAR(255) NOT NULL,
  area VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  passwordHash VARCHAR(255) NULL,
  passwordResetTokenHash VARCHAR(64) NULL,
  passwordResetExpiresAt DATETIME NULL,
  mfaEnabled TINYINT(1) NOT NULL DEFAULT 0,
  mfaCodeHash VARCHAR(64) NULL,
  mfaCodeExpiresAt DATETIME NULL,
  managerId INT NULL,
  role ENUM('admin', 'director', 'manager', 'leader', 'collaborator') NOT NULL DEFAULT 'collaborator',
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  inactiveReason VARCHAR(255) NULL,
  inactiveAt TIMESTAMP NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (managerId) REFERENCES collaborators(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_collaborators_email (email),
  INDEX idx_manager (managerId),
  INDEX idx_role (role),
  INDEX idx_status (status),
  INDEX idx_area (area)
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

-- Tabla de Subperíodos
CREATE TABLE IF NOT EXISTS sub_periods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  periodId INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  startDate DATE NOT NULL,
  endDate DATE NOT NULL,
  status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  weight DECIMAL(5,2) DEFAULT 0.00,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE,
  INDEX idx_period (periodId),
  INDEX idx_dates (startDate, endDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de KPIs
CREATE TABLE IF NOT EXISTS kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type ENUM('growth', 'reduction', 'exact') NOT NULL,
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

-- Tabla de KPIs de Colaboradores (relación muchos a muchos con períodos)
CREATE TABLE IF NOT EXISTS collaborator_kpis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collaboratorId INT NOT NULL,
  kpiId INT NOT NULL,
  periodId INT NOT NULL,
  subPeriodId INT NULL,
  target DECIMAL(10,2) NOT NULL,
  actual DECIMAL(10,2) NULL,
  weight DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  variation DECIMAL(10,2) NULL,
  weightedResult DECIMAL(10,2) NULL,
  status ENUM('draft', 'proposed', 'approved', 'closed') NOT NULL DEFAULT 'draft',
  comments TEXT,
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
  FOREIGN KEY (subPeriodId) REFERENCES sub_periods(id) ON DELETE SET NULL,
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
  assignmentId INT NOT NULL,
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
  FOREIGN KEY (subPeriodId) REFERENCES sub_periods(id) ON DELETE SET NULL,
  FOREIGN KEY (criteriaVersionId) REFERENCES kpi_criteria_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (capturedBy) REFERENCES collaborators(id) ON DELETE SET NULL,
  INDEX idx_assignment (assignmentId),
  INDEX idx_status (status)
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

-- Tabla para estado de notificaciones
CREATE TABLE IF NOT EXISTS notification_states (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  entityKey VARCHAR(100) NOT NULL,
  stateHash VARCHAR(64) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_notification_state (type, entityKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Integraciones y ejecuciones
CREATE TABLE IF NOT EXISTS integrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type ENUM('jira', 'xray', 'db', 'excel', 'api', 'manual', 'other') NOT NULL DEFAULT 'api',
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
  connector ENUM('jira', 'xray', 'azure_devops', 'github', 'servicenow', 'zendesk', 'other') NOT NULL DEFAULT 'jira',
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
  connector ENUM('jira', 'xray', 'azure_devops', 'github', 'servicenow', 'zendesk', 'other') NOT NULL DEFAULT 'jira',
  metricType ENUM('count', 'ratio') NOT NULL DEFAULT 'ratio',
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
  scopeType ENUM('area', 'team', 'person', 'product') NOT NULL DEFAULT 'area',
  scopeId VARCHAR(255) NOT NULL,
  orgScopeId INT NULL,
  params TEXT NULL,
  assignmentId INT NULL,
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
  metadata TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parentId) REFERENCES org_scopes(id) ON DELETE SET NULL,
  INDEX idx_scope_type (type),
  INDEX idx_scope_parent (parentId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE integration_targets
  ADD CONSTRAINT fk_target_org_scope
  FOREIGN KEY (orgScopeId) REFERENCES org_scopes(id) ON DELETE SET NULL;

-- Permisos y superpoderes
ALTER TABLE collaborators
ADD COLUMN IF NOT EXISTS hasSuperpowers TINYINT(1) NOT NULL DEFAULT 0 AFTER role;

CREATE TABLE IF NOT EXISTS permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collaborator_permissions (
  collaboratorId INT NOT NULL,
  permissionId INT NOT NULL,
  PRIMARY KEY (collaboratorId, permissionId),
  CONSTRAINT fk_cp_collaborator FOREIGN KEY (collaboratorId) REFERENCES collaborators(id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_permission FOREIGN KEY (permissionId) REFERENCES permissions(id) ON DELETE CASCADE
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

