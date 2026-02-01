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

ALTER TABLE integrations ADD COLUMN assignmentId INT NULL;
ALTER TABLE integrations ADD COLUMN jql TEXT NULL;
ALTER TABLE integrations ADD COLUMN jqlTests TEXT NULL;
ALTER TABLE integrations ADD COLUMN jqlStories TEXT NULL;
ALTER TABLE integrations ADD INDEX idx_assignment (assignmentId);
ALTER TABLE integrations
  ADD CONSTRAINT fk_integration_assignment
  FOREIGN KEY (assignmentId) REFERENCES collaborator_kpis(id) ON DELETE SET NULL;

ALTER TABLE integration_templates ADD COLUMN metricType ENUM('count', 'ratio') NOT NULL DEFAULT 'ratio';
ALTER TABLE integration_templates ADD COLUMN isSpecific TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE integration_targets ADD COLUMN orgScopeId INT NULL;
ALTER TABLE integration_targets
  ADD CONSTRAINT fk_target_org_scope
  FOREIGN KEY (orgScopeId) REFERENCES org_scopes(id) ON DELETE SET NULL;

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
