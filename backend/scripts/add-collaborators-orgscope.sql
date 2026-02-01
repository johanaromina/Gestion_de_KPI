CREATE TABLE IF NOT EXISTS org_scopes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type ENUM('company', 'area', 'team', 'person', 'product') NOT NULL DEFAULT 'area',
  parentId INT NULL,
  metadata TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_scope_type (type),
  INDEX idx_scope_parent (parentId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE collaborators ADD COLUMN orgScopeId INT NULL;
ALTER TABLE collaborators ADD INDEX idx_collaborators_org_scope (orgScopeId);
ALTER TABLE collaborators
  ADD CONSTRAINT fk_collaborators_org_scope
  FOREIGN KEY (orgScopeId) REFERENCES org_scopes(id) ON DELETE SET NULL;

INSERT INTO org_scopes (name, type, active)
SELECT DISTINCT c.area, 'area', 1
FROM collaborators c
WHERE c.area IS NOT NULL AND c.area <> ''
  AND NOT EXISTS (
    SELECT 1 FROM org_scopes os WHERE os.name = c.area AND os.type = 'area'
  );

UPDATE collaborators c
JOIN org_scopes os ON os.name = c.area AND os.type = 'area'
SET c.orgScopeId = os.id
WHERE c.orgScopeId IS NULL AND c.area IS NOT NULL AND c.area <> '';
