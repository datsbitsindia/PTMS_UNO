-- ================================================================
-- MIGRATION: ptms_uno (uno_ prefix) -> tva_db (tva_ prefix)
-- ================================================================

USE tva_db;
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE tva_organizations;
INSERT INTO tva_organizations SELECT * FROM ptms_uno.uno_organizations;

TRUNCATE TABLE tva_organization_task_counters;
INSERT INTO tva_organization_task_counters SELECT * FROM ptms_uno.uno_organization_task_counters;

TRUNCATE TABLE tva_users;
INSERT INTO tva_users SELECT * FROM ptms_uno.uno_users;

TRUNCATE TABLE tva_user_organizations;
INSERT INTO tva_user_organizations SELECT * FROM ptms_uno.uno_user_organizations;

TRUNCATE TABLE tva_departments;
INSERT INTO tva_departments SELECT * FROM ptms_uno.uno_departments;

TRUNCATE TABLE tva_designations;
INSERT INTO tva_designations SELECT * FROM ptms_uno.uno_designations;

TRUNCATE TABLE tva_priorities;
INSERT INTO tva_priorities SELECT * FROM ptms_uno.uno_priorities;

TRUNCATE TABLE tva_statuses;
INSERT INTO tva_statuses SELECT * FROM ptms_uno.uno_statuses;

TRUNCATE TABLE tva_projects;
INSERT INTO tva_projects SELECT * FROM ptms_uno.uno_projects;

TRUNCATE TABLE tva_project_updates;
INSERT INTO tva_project_updates SELECT * FROM ptms_uno.uno_project_updates;

TRUNCATE TABLE tva_project_assignees;
INSERT INTO tva_project_assignees SELECT * FROM ptms_uno.uno_project_assignees;

TRUNCATE TABLE tva_tasks;
INSERT INTO tva_tasks SELECT * FROM ptms_uno.uno_tasks;

TRUNCATE TABLE tva_task_assignees;
INSERT INTO tva_task_assignees SELECT * FROM ptms_uno.uno_task_assignees;

TRUNCATE TABLE tva_task_forward_logs;
INSERT INTO tva_task_forward_logs SELECT * FROM ptms_uno.uno_task_forward_logs;

TRUNCATE TABLE tva_comments;
INSERT INTO tva_comments SELECT * FROM ptms_uno.uno_comments;

TRUNCATE TABLE tva_attachments;
INSERT INTO tva_attachments SELECT * FROM ptms_uno.uno_attachments;

TRUNCATE TABLE tva_notifications;
INSERT INTO tva_notifications SELECT * FROM ptms_uno.uno_notifications;

TRUNCATE TABLE tva_activity_logs;
INSERT INTO tva_activity_logs SELECT * FROM ptms_uno.uno_activity_logs;

TRUNCATE TABLE tva_daily_routines;
INSERT INTO tva_daily_routines SELECT * FROM ptms_uno.uno_daily_routines;

TRUNCATE TABLE tva_daily_routine_logs;
INSERT INTO tva_daily_routine_logs SELECT * FROM ptms_uno.uno_daily_routine_logs;

TRUNCATE TABLE tva_notes;
INSERT INTO tva_notes SELECT * FROM ptms_uno.uno_notes;

TRUNCATE TABLE tva_sessions;
INSERT INTO tva_sessions SELECT * FROM ptms_uno.uno_sessions;

TRUNCATE TABLE tva_audit_events;
INSERT INTO tva_audit_events SELECT * FROM ptms_uno.uno_audit_events;

SET FOREIGN_KEY_CHECKS = 1;

-- Verify
SELECT 'organizations' as tbl, COUNT(*) as rows FROM tva_organizations
UNION ALL SELECT 'users', COUNT(*) FROM tva_users
UNION ALL SELECT 'projects', COUNT(*) FROM tva_projects
UNION ALL SELECT 'tasks', COUNT(*) FROM tva_tasks
UNION ALL SELECT 'comments', COUNT(*) FROM tva_comments
UNION ALL SELECT 'notifications', COUNT(*) FROM tva_notifications
UNION ALL SELECT 'activity_logs', COUNT(*) FROM tva_activity_logs;

SELECT 'MIGRATION COMPLETE' AS status;
