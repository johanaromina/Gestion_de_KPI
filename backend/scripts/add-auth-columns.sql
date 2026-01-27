ALTER TABLE collaborators
  ADD COLUMN email VARCHAR(255) NULL,
  ADD COLUMN passwordHash VARCHAR(255) NULL,
  ADD COLUMN passwordResetTokenHash VARCHAR(64) NULL,
  ADD COLUMN passwordResetExpiresAt DATETIME NULL,
  ADD COLUMN mfaEnabled TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN mfaCodeHash VARCHAR(64) NULL,
  ADD COLUMN mfaCodeExpiresAt DATETIME NULL;

CREATE UNIQUE INDEX uniq_collaborators_email ON collaborators (email);
