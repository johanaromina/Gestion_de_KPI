-- Roles, permisos por rol y asignaciones por usuario/scope
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
