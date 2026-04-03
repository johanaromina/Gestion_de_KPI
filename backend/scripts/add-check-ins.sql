-- Check-ins semanales: 3 preguntas rápidas vinculadas a KPIs
CREATE TABLE IF NOT EXISTS check_ins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collaboratorId INT NOT NULL,
  weekStart DATE NOT NULL COMMENT 'Lunes de la semana',
  q1 TEXT NOT NULL COMMENT '¿Cómo avanzaste esta semana respecto a tus KPIs?',
  q2 TEXT NOT NULL COMMENT '¿Qué obstáculos encontraste?',
  q3 TEXT NOT NULL COMMENT '¿Cuál es tu foco principal para la próxima semana?',
  mood TINYINT NULL COMMENT '1=muy mal, 2=mal, 3=neutro, 4=bien, 5=muy bien',
  collaboratorKpiId INT NULL COMMENT 'KPI vinculado (opcional)',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_collab_week (collaboratorId, weekStart),
  INDEX idx_checkin_collaborator (collaboratorId),
  INDEX idx_checkin_week (weekStart),
  FOREIGN KEY (collaboratorId) REFERENCES collaborators(id) ON DELETE CASCADE,
  FOREIGN KEY (collaboratorKpiId) REFERENCES collaborator_kpis(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
