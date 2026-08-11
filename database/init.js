const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const config = require('../config');
let pool;

const prefix = config.tablePrefix || 'uno_';
const names = ['users', 'projects', 'project_updates', 'tasks', 'task_assignees', 'task_forward_logs', 'comments', 'attachments', 'notifications', 'activity_logs', 'sessions', 'daily_routines', 'daily_routine_logs', 'notes', 'departments', 'designations', 'project_assignees'];




function sqlName(sql) {
    let value = sql;
    for (const name of names) {
        value = value.replace(new RegExp(`(?<!(?:dataevol_|uno_))\\b${name}\\b`, 'gi'), `${prefix}${name}`);
    }
    return value;
}

const db = {
    prepare(sql) {
        const statement = sqlName(sql);
        return {
            get: async (...params) => (await pool.execute(statement, params))[0][0],
            all: async (...params) => (await pool.execute(statement, params))[0],
            run: async (...params) => {
                const [r] = await pool.execute(statement, params);
                return { lastInsertRowid: r.insertId, changes: r.affectedRows };
            }
        };
    }
};

async function migrateOldTables() {
    const [rows] = await pool.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=?', [config.mysql.database]);
    const found = new Set(rows.map(x => x.TABLE_NAME));
    const pairs = names.filter(n => found.has(n) && !found.has(`${prefix}${n}`)).map(n => `\`${n}\` TO \`${prefix}${n}\``);
    if (pairs.length) await pool.query(`RENAME TABLE ${pairs.join(', ')}`);
}

async function init() {
    const base = await mysql.createConnection({ ...config.mysql, database: undefined });
    await base.query(`CREATE DATABASE IF NOT EXISTS \`${config.mysql.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await base.end();
    pool = mysql.createPool(config.mysql);
    try { await pool.query("SET time_zone = '+05:30'"); } catch (e) { }
    await migrateOldTables();
    await pool.query(`
CREATE TABLE IF NOT EXISTS ${prefix}users (id INT AUTO_INCREMENT PRIMARY KEY,role ENUM('admin','manager','employee') NOT NULL,name VARCHAR(120) NOT NULL,email VARCHAR(190) UNIQUE NOT NULL,password VARCHAR(255) NOT NULL,phone VARCHAR(30) DEFAULT '',department VARCHAR(100) DEFAULT '',designation VARCHAR(100) DEFAULT '',photo VARCHAR(255) DEFAULT '',active BOOLEAN DEFAULT TRUE,created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ${prefix}projects (id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(150) NOT NULL,description TEXT,start_date DATE NULL,end_date DATE NULL,status ENUM('Planned','In Progress','Completed','Cancelled') DEFAULT 'Planned',created_by INT NOT NULL,manager_id INT NOT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,started_at DATETIME NULL,completed_at DATETIME NULL,FOREIGN KEY(created_by) REFERENCES ${prefix}users(id),FOREIGN KEY(manager_id) REFERENCES ${prefix}users(id)) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ${prefix}project_updates (id INT AUTO_INCREMENT PRIMARY KEY,project_id INT NOT NULL,manager_id INT NOT NULL,message TEXT NOT NULL,progress_percent INT DEFAULT 0,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(project_id) REFERENCES ${prefix}projects(id) ON DELETE CASCADE,FOREIGN KEY(manager_id) REFERENCES ${prefix}users(id)) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ${prefix}daily_routines (id INT AUTO_INCREMENT PRIMARY KEY,project_id INT NOT NULL,created_by INT NOT NULL,assigned_to INT NOT NULL,title VARCHAR(150) NOT NULL,description TEXT,priority ENUM('Low','Medium','High','Critical') DEFAULT 'High',estimated_hours DECIMAL(8,2) DEFAULT 0,start_date DATE NOT NULL,end_date DATE NOT NULL,daily_time VARCHAR(20) DEFAULT '09:00 AM',repeat_type VARCHAR(50) DEFAULT 'Daily',week_days VARCHAR(100) DEFAULT '',mandatory BOOLEAN DEFAULT TRUE,active BOOLEAN DEFAULT TRUE,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(project_id) REFERENCES ${prefix}projects(id) ON DELETE CASCADE,FOREIGN KEY(created_by) REFERENCES ${prefix}users(id),FOREIGN KEY(assigned_to) REFERENCES ${prefix}users(id)) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ${prefix}tasks (id INT AUTO_INCREMENT PRIMARY KEY,project_id INT NULL,title VARCHAR(150) NOT NULL,description TEXT,priority ENUM('Low','Medium','High','Critical') NOT NULL,status ENUM('Pending','In Progress','Completed','Cancelled') DEFAULT 'Pending',due_date DATE NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,started_at DATETIME NULL,created_by INT NOT NULL,assigned_to INT NOT NULL,estimated_hours DECIMAL(8,2) DEFAULT 0,completed_at DATETIME NULL,routine_id INT NULL,is_routine BOOLEAN DEFAULT FALSE,is_forwarded BOOLEAN DEFAULT FALSE,FOREIGN KEY(project_id) REFERENCES ${prefix}projects(id) ON DELETE CASCADE,FOREIGN KEY(created_by) REFERENCES ${prefix}users(id),FOREIGN KEY(assigned_to) REFERENCES ${prefix}users(id),FOREIGN KEY(routine_id) REFERENCES ${prefix}daily_routines(id) ON DELETE CASCADE) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ${prefix}task_forward_logs (id INT AUTO_INCREMENT PRIMARY KEY,task_id INT NOT NULL,from_user_id INT NOT NULL,to_user_id INT NOT NULL,reason TEXT NOT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(task_id) REFERENCES ${prefix}tasks(id) ON DELETE CASCADE,FOREIGN KEY(from_user_id) REFERENCES ${prefix}users(id),FOREIGN KEY(to_user_id) REFERENCES ${prefix}users(id)) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ${prefix}daily_routine_logs (id INT AUTO_INCREMENT PRIMARY KEY,routine_id INT NOT NULL,task_id INT NOT NULL,assigned_to INT NOT NULL,execution_date DATE NOT NULL,status ENUM('Generated','In Progress','Completed','Missed') DEFAULT 'Generated',completed_at DATETIME NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(routine_id) REFERENCES ${prefix}daily_routines(id) ON DELETE CASCADE,FOREIGN KEY(task_id) REFERENCES ${prefix}tasks(id) ON DELETE CASCADE,FOREIGN KEY(assigned_to) REFERENCES ${prefix}users(id)) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ${prefix}comments (id INT AUTO_INCREMENT PRIMARY KEY,task_id INT NOT NULL,user_id INT NOT NULL,message TEXT NOT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(task_id) REFERENCES ${prefix}tasks(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES ${prefix}users(id)) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ${prefix}attachments (id INT AUTO_INCREMENT PRIMARY KEY,task_id INT NOT NULL,user_id INT NOT NULL,original_name VARCHAR(255) NOT NULL,stored_name VARCHAR(255) NOT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(task_id) REFERENCES ${prefix}tasks(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES ${prefix}users(id)) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ${prefix}notifications (id INT AUTO_INCREMENT PRIMARY KEY,user_id INT NOT NULL,message VARCHAR(255) NOT NULL,link VARCHAR(255) DEFAULT '',is_read BOOLEAN DEFAULT FALSE,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES ${prefix}users(id) ON DELETE CASCADE) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ${prefix}activity_logs (id INT AUTO_INCREMENT PRIMARY KEY,user_id INT NULL,action VARCHAR(100) NOT NULL,detail VARCHAR(255) DEFAULT '',created_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES ${prefix}users(id) ON DELETE SET NULL) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ${prefix}notes (id INT AUTO_INCREMENT PRIMARY KEY,user_id INT NOT NULL,title VARCHAR(255) NOT NULL DEFAULT '',details LONGTEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES ${prefix}users(id) ON DELETE CASCADE) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ${prefix}task_assignees (id INT AUTO_INCREMENT PRIMARY KEY,task_id INT NOT NULL,user_id INT NOT NULL,status ENUM('Pending','In Progress','Completed','Cancelled') DEFAULT 'Pending',completed_at DATETIME NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uk_task_user (task_id, user_id),FOREIGN KEY(task_id) REFERENCES ${prefix}tasks(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES ${prefix}users(id) ON DELETE CASCADE) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ${prefix}audit_events (id BIGINT AUTO_INCREMENT PRIMARY KEY,user_id INT NULL,user_name VARCHAR(120),user_role VARCHAR(30),event_type VARCHAR(60) NOT NULL,action VARCHAR(150) NOT NULL,http_method VARCHAR(10),path VARCHAR(500),entity_type VARCHAR(50),entity_id INT NULL,description TEXT,metadata JSON,ip_address VARCHAR(64),user_agent VARCHAR(500),created_at DATETIME DEFAULT CURRENT_TIMESTAMP,INDEX idx_audit_user(user_id),INDEX idx_audit_created(created_at),INDEX idx_audit_entity(entity_type,entity_id),FOREIGN KEY(user_id) REFERENCES ${prefix}users(id) ON DELETE SET NULL) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ${prefix}departments (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150) NOT NULL, normalized_name VARCHAR(150) UNIQUE NOT NULL, active BOOLEAN DEFAULT TRUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ${prefix}designations (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150) NOT NULL, normalized_name VARCHAR(150) UNIQUE NOT NULL, active BOOLEAN DEFAULT TRUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ${prefix}project_assignees (id INT AUTO_INCREMENT PRIMARY KEY, project_id INT NOT NULL, user_id INT NOT NULL, status ENUM('Pending','In Progress','Completed') DEFAULT 'Pending', completed_at DATETIME NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uk_project_user (project_id, user_id), FOREIGN KEY(project_id) REFERENCES ${prefix}projects(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES ${prefix}users(id) ON DELETE CASCADE) ENGINE=InnoDB;`);

    try {
        const [rows] = await pool.query(
            `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME='manager_id' AND REFERENCED_TABLE_NAME IS NOT NULL`,
            [config.mysql.database, `${prefix}projects`]
        );
        for (const r of rows) {
            try { await pool.query(`ALTER TABLE ${prefix}projects DROP FOREIGN KEY ${r.CONSTRAINT_NAME}`); } catch(e) {}
        }
        await pool.query(`ALTER TABLE ${prefix}projects MODIFY manager_id VARCHAR(255) NOT NULL`);
    } catch(e) {}

    try {
        await pool.query(`DROP TRIGGER IF EXISTS ${prefix}projects_audit_update`);
        await pool.query(`
            CREATE TRIGGER ${prefix}projects_audit_update BEFORE UPDATE ON ${prefix}projects
            FOR EACH ROW
            BEGIN
                IF NEW.updated_by IS NULL THEN
                    SET NEW.updated_by = CAST(SUBSTRING_INDEX(NEW.manager_id, ',', 1) AS UNSIGNED);
                END IF;
            END
        `);
    } catch(e) {}


    try {
        await pool.query(`DELETE FROM ${prefix}task_assignees WHERE task_id IN (SELECT task_id FROM (SELECT task_id FROM ${prefix}task_assignees GROUP BY task_id HAVING COUNT(*) <= 1) tmp)`);
        await pool.query(`UPDATE ${prefix}tasks t JOIN (SELECT task_id, GROUP_CONCAT(user_id ORDER BY id SEPARATOR ',') AS all_ids FROM ${prefix}task_assignees GROUP BY task_id HAVING COUNT(*) > 1) ta ON ta.task_id = t.id SET t.assigned_to = ta.all_ids`);
    } catch(e) {}

    await addColumn(`${prefix}users`, 'department_id', 'INT NULL');
    await addColumn(`${prefix}users`, 'designation_id', 'INT NULL');


    try {
        const [usersToMigrate] = await pool.query(`SELECT id, department, designation, department_id, designation_id FROM ${prefix}users`);
        for (const u of usersToMigrate) {
            if (u.department && u.department.trim()) {
                const cleanDept = u.department.trim();
                const normDept = cleanDept.toLowerCase();
                await pool.query(`INSERT IGNORE INTO ${prefix}departments (name, normalized_name, active) VALUES (?, ?, 1)`, [cleanDept, normDept]);
                const [deptRows] = await pool.query(`SELECT id FROM ${prefix}departments WHERE normalized_name=?`, [normDept]);
                if (deptRows.length && !u.department_id) {
                    await pool.query(`UPDATE ${prefix}users SET department_id=? WHERE id=?`, [deptRows[0].id, u.id]);
                }
            }
            if (u.designation && u.designation.trim()) {
                const cleanDesig = u.designation.trim();
                const normDesig = cleanDesig.toLowerCase();
                await pool.query(`INSERT IGNORE INTO ${prefix}designations (name, normalized_name, active) VALUES (?, ?, 1)`, [cleanDesig, normDesig]);
                const [desigRows] = await pool.query(`SELECT id FROM ${prefix}designations WHERE normalized_name=?`, [normDesig]);
                if (desigRows.length && !u.designation_id) {
                    await pool.query(`UPDATE ${prefix}users SET designation_id=? WHERE id=?`, [desigRows[0].id, u.id]);
                }
            }
        }
    } catch(e) {}




    await addColumn(`${prefix}tasks`, 'project_id', 'INT NULL AFTER id');
    await addColumn(`${prefix}tasks`, 'routine_id', 'INT NULL AFTER completed_at');
    await addColumn(`${prefix}tasks`, 'is_routine', 'BOOLEAN DEFAULT FALSE AFTER routine_id');
    await addColumn(`${prefix}tasks`, 'is_forwarded', 'BOOLEAN DEFAULT FALSE AFTER is_routine');
    await addColumn(`${prefix}tasks`, 'is_self_task', 'BOOLEAN DEFAULT FALSE AFTER is_forwarded');
    await addColumn(`${prefix}tasks`, 'started_at', 'DATETIME NULL AFTER created_at');
    await addColumn(`${prefix}projects`, 'started_at', 'DATETIME NULL AFTER created_at');
    await addColumn(`${prefix}projects`, 'completed_at', 'DATETIME NULL AFTER started_at');
    await fixTasksAssignedToColumn();
    await addStandardAuditColumns();


    await removeAuditNameColumns();
    await pool.query(`ALTER TABLE ${prefix}users MODIFY role ENUM('admin','manager','employee') NOT NULL`);
    await pool.query(`ALTER TABLE ${prefix}notes MODIFY details LONGTEXT`);
    await createAuditTriggers();
    await createReportingObjects();
    await seed();
    return pool;
}

async function fixTasksAssignedToColumn() {
    try {
        const [rows] = await pool.query(
            `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME='assigned_to' AND REFERENCED_TABLE_NAME IS NOT NULL`,
            [config.mysql.database, `${prefix}tasks`]
        );
        for (const r of rows) {
            try {
                await pool.query(`ALTER TABLE ${prefix}tasks DROP FOREIGN KEY ${r.CONSTRAINT_NAME}`);
            } catch(e) {}
        }
        await pool.query(`ALTER TABLE ${prefix}tasks MODIFY assigned_to VARCHAR(255) NOT NULL`);
    } catch(e) {}
}

async function addColumn(table, column, definition) {

    const [r] = await pool.query('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?', [config.mysql.database, table, column]);
    if (!r.length) await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

async function addStandardAuditColumns() {
    const definitions = {};
    definitions[`${prefix}users`] = [['created_by', 'INT NULL'], ['updated_by', 'INT NULL'], ['updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP']];
    definitions[`${prefix}projects`] = [['updated_by', 'INT NULL'], ['updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP']];
    definitions[`${prefix}project_updates`] = [['created_by', 'INT NULL'], ['updated_by', 'INT NULL'], ['updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP']];
    definitions[`${prefix}tasks`] = [['updated_by', 'INT NULL'], ['updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP']];
    definitions[`${prefix}task_forward_logs`] = [['created_by', 'INT NULL'], ['updated_by', 'INT NULL'], ['updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP']];
    definitions[`${prefix}daily_routines`] = [['created_by', 'INT NULL'], ['updated_by', 'INT NULL'], ['updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP']];
    definitions[`${prefix}daily_routine_logs`] = [['created_by', 'INT NULL'], ['updated_by', 'INT NULL'], ['updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP']];
    definitions[`${prefix}comments`] = [['created_by', 'INT NULL'], ['updated_by', 'INT NULL'], ['updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP']];
    definitions[`${prefix}attachments`] = [['created_by', 'INT NULL'], ['updated_by', 'INT NULL'], ['updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP']];
    definitions[`${prefix}notifications`] = [['created_by', 'INT NULL'], ['updated_by', 'INT NULL'], ['updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP']];

    for (const [table, columns] of Object.entries(definitions)) {
        for (const [column, definition] of columns) await addColumn(table, column, definition);
    }
    await pool.query(`UPDATE ${prefix}project_updates SET created_by=manager_id WHERE created_by IS NULL`);
    await pool.query(`UPDATE ${prefix}comments SET created_by=user_id WHERE created_by IS NULL`);
    await pool.query(`UPDATE ${prefix}attachments SET created_by=user_id WHERE created_by IS NULL`);
}

async function removeAuditNameColumns() {
    for (const column of ['user_name', 'user_role']) {
        const [r] = await pool.query('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?', [config.mysql.database, `${prefix}audit_events`, column]);
        if (r.length) await pool.query(`ALTER TABLE ${prefix}audit_events DROP COLUMN \`${column}\``);
    }
}

async function createAuditTriggers() {
    const triggers = {};
    triggers[`${prefix}comments_audit_insert`] = `BEFORE INSERT ON ${prefix}comments FOR EACH ROW SET NEW.created_by=NEW.user_id`;
    triggers[`${prefix}attachments_audit_insert`] = `BEFORE INSERT ON ${prefix}attachments FOR EACH ROW SET NEW.created_by=NEW.user_id`;
    triggers[`${prefix}project_updates_audit_insert`] = `BEFORE INSERT ON ${prefix}project_updates FOR EACH ROW SET NEW.created_by=NEW.manager_id`;
    triggers[`${prefix}tasks_audit_update`] = `BEFORE UPDATE ON ${prefix}tasks FOR EACH ROW SET NEW.updated_by=COALESCE(NEW.updated_by,NEW.assigned_to)`;
    triggers[`${prefix}projects_audit_update`] = `BEFORE UPDATE ON ${prefix}projects FOR EACH ROW SET NEW.updated_by=COALESCE(NEW.updated_by,NEW.manager_id)`;
    triggers[`${prefix}notifications_audit_update`] = `BEFORE UPDATE ON ${prefix}notifications FOR EACH ROW SET NEW.updated_by=COALESCE(NEW.updated_by,NEW.user_id)`;

    for (const [name, body] of Object.entries(triggers)) {
        await pool.query(`DROP TRIGGER IF EXISTS \`${name}\``);
        await pool.query(`CREATE TRIGGER \`${name}\` ${body}`);
    }
}

async function createReportingObjects() {
    await pool.query(`CREATE OR REPLACE VIEW ${prefix}project_summary AS SELECT p.id project_id,p.description,p.created_by created_by_user_id,p.manager_id manager_user_id,p.created_at assigned_at,p.updated_by updated_by_user_id,p.updated_at,p.start_date,p.end_date due_date,p.started_at,p.completed_at,p.status,COUNT(t.id) total_tasks,SUM(t.status='Completed') completed_tasks FROM ${prefix}projects p LEFT JOIN ${prefix}tasks t ON t.project_id=p.id GROUP BY p.id`);
    await pool.query(`CREATE OR REPLACE VIEW ${prefix}task_details AS SELECT t.id task_id,t.project_id,t.description,t.priority,t.status,t.created_by created_by_user_id,t.assigned_to assigned_to_user_id,t.updated_by updated_by_user_id,t.created_at assigned_at,t.updated_at,t.started_at,t.due_date,t.completed_at,t.estimated_hours FROM ${prefix}tasks t`);
    await pool.query(`CREATE OR REPLACE VIEW ${prefix}daily_routine_summary AS SELECT r.id routine_id,r.title,r.project_id,r.created_by,r.assigned_to,r.start_date,r.end_date,r.daily_time,r.priority,r.mandatory,r.active,COUNT(l.id) total_generated,SUM(l.status='Completed') total_completed FROM ${prefix}daily_routines r LEFT JOIN ${prefix}daily_routine_logs l ON l.routine_id=r.id GROUP BY r.id`);
    await pool.query(`DROP PROCEDURE IF EXISTS ${prefix}log_audit`);
    await pool.query(`CREATE PROCEDURE ${prefix}log_audit(IN p_user_id INT,IN p_event_type VARCHAR(60),IN p_action VARCHAR(150),IN p_description TEXT) INSERT INTO ${prefix}audit_events(user_id,event_type,action,description) VALUES(p_user_id,p_event_type,p_action,p_description)`);
}

async function seed() {
    if (prefix === 'uno_') {
        const [rows] = await pool.query(`SELECT COUNT(*) count FROM ${prefix}users`);
        if (rows[0] && rows[0].count > 0) {
            // Users table already has records, do not re-seed or truncate
            return;
        }
        const hash = await bcrypt.hash('admin@123', 12);
        await pool.query(
            `INSERT INTO ${prefix}users (role, name, email, password, phone, department, designation, active) VALUES ('admin', 'System Admin', 'admin@gmail.com', ?, '', 'Management', 'Administrator', 1)`,
            [hash]
        );
    }
}

module.exports = { db, init, getPool: () => pool, sqlName };
