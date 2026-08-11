const { db } = require('../database/init');
const activity = require('../services/activityService');
const notifications = require('../services/notificationService');

const resolveStatusName = (statusVal, statusIdVal) => {
    if (statusVal !== null && statusVal !== undefined) {
        const strVal = String(statusVal).trim().toLowerCase();
        if (strVal === '0' || strVal === 'pending') return 'Pending';
        if (strVal === '1' || strVal === 'in progress') return 'In Progress';
        if (strVal === '2' || strVal === 'completed') return 'Completed';
        if (strVal === '3' || strVal === 'cancelled') return 'Cancelled';
        if (strVal === '4' || strVal === 'planned') return 'Planned';
        if (strVal === '5' || strVal === 'generated') return 'Generated';
        if (strVal === '6' || strVal === 'missed') return 'Missed';
    }
    if (statusIdVal !== null && statusIdVal !== undefined) {
        const strId = String(statusIdVal).trim();
        if (strId === '0') return 'Pending';
        if (strId === '1') return 'In Progress';
        if (strId === '2') return 'Completed';
        if (strId === '3') return 'Cancelled';
        if (strId === '4') return 'Planned';
        if (strId === '5') return 'Generated';
        if (strId === '6') return 'Missed';
    }
    return 'In Progress';
};


exports.list = async (req, res) => {
    const u = req.session.user;
    const statusOrderSql = "ORDER BY CASE LOWER(p.status) WHEN 'planned' THEN 1 WHEN 'pending' THEN 2 WHEN 'in progress' THEN 3 WHEN 'completed' THEN 4 WHEN 'cancelled' THEN 5 ELSE 6 END, p.created_at DESC";
    
    let whereConditions = u.role === 'admin' ? [] : ['FIND_IN_SET(?, p.manager_id) > 0'];
    let params = u.role === 'admin' ? [] : [u.id];

    if (req.query.status) {
        const st = req.query.status.toLowerCase().trim();
        if (st === 'pending' || st === 'in progress') {
            whereConditions.push("p.status IN ('Planned', 'In Progress', 'Pending')");
        } else {
            whereConditions.push("LOWER(p.status) = ?");
            params.push(st);
        }
    }

    const whereClause = whereConditions.length ? 'WHERE ' + whereConditions.join(' AND ') : '';
    const rawProjects = await db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) task_count, CASE WHEN p.end_date<CURDATE() AND COALESCE(p.status, '') NOT IN ('Completed','Cancelled', '2', '3') THEN 1 ELSE 0 END is_overdue FROM projects p ${whereClause} ${statusOrderSql}`).all(...params);

    const allManagers = await db.prepare("SELECT id, name FROM users WHERE role='manager'").all();
    const managerMap = new Map(allManagers.map(m => [m.id, m.name]));

    const projects = rawProjects.map(p => {
        const ids = String(p.manager_id || '').split(',').map(x => Number(x.trim())).filter(Boolean);
        const names = ids.map(id => managerMap.get(id) || `Manager #${id}`).join(', ');
        return {
            ...p,
            status: resolveStatusName(p.status, p.status_id),
            manager_name: names || 'Unassigned'
        };
    });


    const managers = u.role === 'admin' ? await db.prepare("SELECT id, name, designation FROM users WHERE role='manager' AND active=1 ORDER BY name").all() : [];
    res.render('projects', {
        projects,
        managers
    });
};

exports.save = async (req, res) => {
    const {
        id,
        name,
        description = '',
        start_date,
        end_date
    } = req.body;

    const rawInput = req.body.manager_id || req.body.assigned_to;
    let rawManagerIds = [];
    if (Array.isArray(rawInput)) {
        rawManagerIds = rawInput;
    } else if (rawInput) {
        rawManagerIds = [rawInput];
    }


    const managerIds = [...new Set(rawManagerIds.map(x => Number(x)).filter(Boolean))];
    if (!name || !managerIds.length) {
        return res.status(400).render('error', {
            message: 'Project name and at least one manager are required'
        });
    }

    const managerIdStr = managerIds.join(',');

    if (id) {
        const existing = await db.prepare('SELECT * FROM projects WHERE id=?').get(id);
        if (!existing) return res.status(404).render('error', { message: 'Project not found' });

        await db.prepare('UPDATE projects SET name=?,description=?,start_date=?,end_date=?,manager_id=? WHERE id=?').run(
            name, description, start_date || null, end_date || null, managerIdStr, id
        );

        if (managerIds.length > 1) {
            for (const mId of managerIds) {
                await db.prepare('INSERT IGNORE INTO project_assignees(project_id, user_id, status) VALUES(?,?,?)').run(id, mId, 'Pending');
            }
        }

        await activity.log(req.session.user.id, 'Project Updated', name);
        for (const mId of managerIds) {
            await notifications.notify(mId, `Project Updated: ${req.session.user.name} updated details for '${name}'`, `/projects/${id}`);
        }
        res.redirect(`/projects/${id}`);
    } else {
        const statusRow = await db.prepare('SELECT id FROM statuses WHERE normalized_name=?').get('planned');
        const statusId = (statusRow && statusRow.id !== undefined) ? statusRow.id : 4;
        const result = await db.prepare('INSERT INTO projects(name,description,start_date,end_date,created_by,manager_id,status,status_id) VALUES(?,?,?,?,?,?,?,?)').run(
            name, description, start_date || null, end_date || null, req.session.user.id, managerIdStr, statusId, statusId
        );
        const projectId = result.lastInsertRowid;

        if (managerIds.length > 1) {
            for (const mId of managerIds) {
                await db.prepare('INSERT IGNORE INTO project_assignees(project_id, user_id, status, status_id) VALUES(?,?,?,?)').run(projectId, mId, 0, 0);
            }
        }



        await activity.log(req.session.user.id, 'Project Assigned', name);
        for (const mId of managerIds) {
            await notifications.notify(mId, `New project assigned: ${name}`, `/projects/${projectId}`);
        }
        res.redirect('/projects');
    }
};

exports.detail = async (req, res) => {
    const u = req.session.user;
    const project = await db.prepare("SELECT p.*, c.name creator_name FROM projects p JOIN users c ON c.id=p.created_by WHERE p.id=?").get(req.params.id);

    if (!project) return res.status(404).render('error', { message: 'Project not found' });
    project.status = resolveStatusName(project.status, project.status_id);


    const managerIds = String(project.manager_id || '').split(',').map(x => Number(x.trim())).filter(Boolean);
    const isAssignedManager = managerIds.includes(u.id);

    if (u.role !== 'admin' && !isAssignedManager) {
        return res.status(403).render('error', { message: 'Access denied' });
    }

    const allManagers = await db.prepare("SELECT id, name FROM users WHERE role='manager'").all();
    const managerMap = new Map(allManagers.map(m => [m.id, m.name]));
    project.manager_name = managerIds.map(id => managerMap.get(id) || `Manager #${id}`).join(', ');

    const projectAssignees = await db.prepare('SELECT pa.*, u.name, u.email FROM project_assignees pa JOIN users u ON u.id=pa.user_id WHERE pa.project_id=?').all(project.id);

    const tasks = await db.prepare("SELECT t.*, u.name employee_name FROM tasks t JOIN users u ON u.id=t.assigned_to WHERE t.project_id=? ORDER BY CASE LOWER(t.status) WHEN 'planned' THEN 1 WHEN 'pending' THEN 2 WHEN 'in progress' THEN 3 WHEN 'completed' THEN 4 WHEN 'cancelled' THEN 5 ELSE 6 END, t.created_at DESC").all(project.id);
    const updates = await db.prepare('SELECT x.*, u.name manager_name FROM project_updates x JOIN users u ON u.id=x.manager_id WHERE x.project_id=? ORDER BY x.created_at DESC').all(project.id);
    const managers = u.role === 'admin' ? await db.prepare("SELECT id, name FROM users WHERE role='manager' AND active=1 ORDER BY name").all() : [];

    res.render('project-detail', {
        project,
        projectAssignees,
        tasks,
        updates,
        managers,
        success: req.query.success || ''
    });
};

exports.addUpdate = async (req, res) => {
    const u = req.session.user;
    const project = await db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);

    if (!project) return res.status(404).render('error', { message: 'Project not found' });

    const managerIds = String(project.manager_id || '').split(',').map(x => Number(x.trim())).filter(Boolean);
    if (!managerIds.includes(u.id) && u.role !== 'admin') {
        return res.status(403).render('error', { message: 'Access denied' });
    }

    const message = String(req.body.message || '').trim();
    const progress = Math.max(0, Math.min(100, Number(req.body.progress_percent) || 0));

    if (!message) return res.status(400).render('error', { message: 'Project update details are required' });

    await db.prepare('INSERT INTO project_updates(project_id,manager_id,message,progress_percent) VALUES(?,?,?,?)').run(project.id, u.id, message, progress);

    const newStatus = progress >= 100 ? 'Completed' : progress > 0 ? 'In Progress' : 'Planned';

    if (managerIds.length > 1) {
        await db.prepare('INSERT INTO project_assignees(project_id, user_id, status) VALUES(?,?,?) ON DUPLICATE KEY UPDATE status=?, completed_at=CASE WHEN ?=\'Completed\' THEN NOW() ELSE NULL END').run(
            project.id, u.id, newStatus, newStatus, newStatus
        );

        const stats = await db.prepare('SELECT COUNT(*) total, SUM(CASE WHEN status=\'Completed\' THEN 1 ELSE 0 END) completed FROM project_assignees WHERE project_id=?').get(project.id);
        const allCompleted = stats && Number(stats.total) > 0 && Number(stats.total) === Number(stats.completed);

        const overallStatus = allCompleted ? 'Completed' : 'In Progress';
        await db.prepare("UPDATE projects SET status=?, updated_by=?, started_at=CASE WHEN started_at IS NULL THEN NOW() ELSE started_at END, completed_at=CASE WHEN ?='Completed' THEN NOW() ELSE NULL END WHERE id=?").run(
            overallStatus, u.id, overallStatus, project.id
        );
    } else {
        await db.prepare("UPDATE projects SET status=?, updated_by=?, started_at=CASE WHEN ?='In Progress' AND started_at IS NULL THEN NOW() ELSE started_at END, completed_at=CASE WHEN ?='Completed' THEN NOW() ELSE NULL END WHERE id=?").run(
            newStatus, u.id, newStatus, newStatus, project.id
        );
    }


    await activity.log(u.id, 'Project Daily Update', project.name);
    await notifications.notify(project.created_by, `${u.name} added an update to ${project.name}`, `/projects/${project.id}`);
    res.redirect(`/projects/${project.id}?success=update`);
};