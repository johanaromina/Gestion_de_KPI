-- Nuevas tablas para permisos y superpoderes

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
('config.view', 'Ver sección de configuración');


