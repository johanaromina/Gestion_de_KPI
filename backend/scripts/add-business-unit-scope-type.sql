-- Add 'business_unit' to org_scopes.type ENUM
-- Required for CSV area import where type = 'business_unit'
ALTER TABLE org_scopes
  MODIFY COLUMN type ENUM('company', 'area', 'team', 'person', 'product', 'business_unit') NOT NULL DEFAULT 'area';
