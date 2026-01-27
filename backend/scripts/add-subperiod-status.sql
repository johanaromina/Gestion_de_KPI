ALTER TABLE sub_periods
  ADD COLUMN status ENUM('open', 'closed') NOT NULL DEFAULT 'open';
