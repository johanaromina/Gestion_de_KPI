-- Calendarios de medicion por scope

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

ALTER TABLE calendar_subperiods
  ADD COLUMN calendarProfileId INT NULL AFTER periodId;

ALTER TABLE calendar_subperiods
  ADD COLUMN status ENUM('open', 'closed') NOT NULL DEFAULT 'open' AFTER endDate;

ALTER TABLE org_scopes
  ADD COLUMN calendarProfileId INT NULL AFTER parentId;

ALTER TABLE collaborator_kpis
  ADD COLUMN calendarProfileId INT NULL AFTER periodId;

ALTER TABLE calendar_subperiods
  ADD CONSTRAINT fk_subperiod_calendar FOREIGN KEY (calendarProfileId) REFERENCES calendar_profiles(id) ON DELETE SET NULL;

ALTER TABLE org_scopes
  ADD CONSTRAINT fk_scope_calendar FOREIGN KEY (calendarProfileId) REFERENCES calendar_profiles(id) ON DELETE SET NULL;

ALTER TABLE collaborator_kpis
  ADD CONSTRAINT fk_ck_calendar FOREIGN KEY (calendarProfileId) REFERENCES calendar_profiles(id) ON DELETE SET NULL;

INSERT IGNORE INTO calendar_profiles (name, description, frequency, active)
VALUES ('Default', 'Calendario por defecto', 'monthly', 1);

UPDATE calendar_subperiods
SET calendarProfileId = (SELECT id FROM calendar_profiles WHERE name = 'Default' LIMIT 1)
WHERE calendarProfileId IS NULL;

UPDATE org_scopes
SET calendarProfileId = (SELECT id FROM calendar_profiles WHERE name = 'Default' LIMIT 1)
WHERE calendarProfileId IS NULL;

UPDATE collaborator_kpis
SET calendarProfileId = (SELECT id FROM calendar_profiles WHERE name = 'Default' LIMIT 1)
WHERE calendarProfileId IS NULL;
