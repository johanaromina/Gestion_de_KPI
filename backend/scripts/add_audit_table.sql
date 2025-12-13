-- Script para agregar tabla de auditoría
-- Ejecutar este script después de crear la base de datos inicial

USE gestion_kpi;

-- Tabla de Auditoría
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entityType VARCHAR(50) NOT NULL COMMENT 'Tipo de entidad: collaborators, kpis, collaborator_kpis, periods, etc.',
  entityId INT NOT NULL COMMENT 'ID de la entidad modificada',
  action ENUM('CREATE', 'UPDATE', 'DELETE') NOT NULL COMMENT 'Acción realizada',
  userId INT NULL COMMENT 'ID del usuario que realizó la acción',
  userName VARCHAR(255) NULL COMMENT 'Nombre del usuario (cache)',
  oldValues JSON NULL COMMENT 'Valores anteriores (solo para UPDATE)',
  newValues JSON NULL COMMENT 'Valores nuevos',
  changes JSON NULL COMMENT 'Resumen de cambios específicos',
  ipAddress VARCHAR(45) NULL COMMENT 'Dirección IP del usuario',
  userAgent TEXT NULL COMMENT 'User agent del navegador',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha y hora del cambio',
  INDEX idx_entity (entityType, entityId),
  INDEX idx_user (userId),
  INDEX idx_action (action),
  INDEX idx_created (createdAt),
  INDEX idx_entity_type (entityType)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

