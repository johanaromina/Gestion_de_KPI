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
