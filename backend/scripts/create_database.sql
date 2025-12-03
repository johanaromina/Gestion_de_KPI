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
  managerId INT NULL,
  role ENUM('admin', 'director', 'manager', 'leader', 'collaborator') NOT NULL DEFAULT 'collaborator',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (managerId) REFERENCES collaborators(id) ON DELETE SET NULL,
  INDEX idx_manager (managerId),
  INDEX idx_role (role),
  INDEX idx_area (area)
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
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (collaboratorId) REFERENCES collaborators(id) ON DELETE CASCADE,
  FOREIGN KEY (kpiId) REFERENCES kpis(id) ON DELETE CASCADE,
  FOREIGN KEY (periodId) REFERENCES periods(id) ON DELETE CASCADE,
  FOREIGN KEY (subPeriodId) REFERENCES sub_periods(id) ON DELETE SET NULL,
  INDEX idx_collaborator (collaboratorId),
  INDEX idx_period (periodId),
  INDEX idx_status (status),
  UNIQUE KEY unique_collaborator_kpi_period (collaboratorId, kpiId, periodId, subPeriodId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

