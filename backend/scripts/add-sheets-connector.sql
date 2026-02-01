ALTER TABLE auth_profiles
  MODIFY connector ENUM('jira', 'xray', 'sheets', 'azure_devops', 'github', 'servicenow', 'zendesk', 'other')
  NOT NULL DEFAULT 'jira';

ALTER TABLE integration_templates
  MODIFY connector ENUM('jira', 'xray', 'sheets', 'azure_devops', 'github', 'servicenow', 'zendesk', 'other')
  NOT NULL DEFAULT 'jira';
