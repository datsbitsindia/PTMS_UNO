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


const statusRank = (statusStr) => {
    const s = String(statusStr || '').toLowerCase().trim();
    if (s === 'planned' || s === '4') return 1;
    if (s === 'pending' || s === '0') return 2;
    if (s === 'in progress' || s === '1') return 3;
    if (s === 'completed' || s === '2') return 4;
    if (s === 'cancelled' || s === '3') return 5;
    return 6;
};

exports.list = async (req, res) => {
    const u = req.session.user;
    const orgId = u.organization_id || 1;
    
    let whereConditions = ['p.organization_id = ?'];
    let params = [orgId];

    if (u.role !== 'admin') {
        whereConditions.push('FIND_IN_SET(?, p.manager_id) > 0');
        params.push(u.id);
    }

    if (req.query.status) {
        const st = req.query.status.toLowerCase().trim();
        if (st === 'pending' || st === 'in progress') {
            whereConditions.push("p.status IN ('Planned', 'In Progress', 'Pending', '4', '1', '0')");
        } else {
            whereConditions.push("(LOWER(CAST(p.status AS CHAR)) = ? OR LOWER(CAST(p.status_id AS CHAR)) = ?)");
            params.push(st, st);
        }
    }

    const whereClause = 'WHERE ' + whereConditions.join(' AND ');
    const rawProjects = await db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) task_count, CASE WHEN p.end_date<CURDATE() AND COALESCE(p.status, '') NOT IN ('Completed','Cancelled', '2', '3') THEN 1 ELSE 0 END is_overdue FROM projects p ${whereClause} ORDER BY p.created_at DESC`).all(...params);

    const allManagers = await db.prepare("SELECT id, name FROM users WHERE (organization_id=? OR id IN (SELECT user_id FROM user_organizations WHERE organization_id=?))").all(orgId, orgId);
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

    // Enforce strict status sorting: Planned -> Pending -> In Progress -> Completed -> Cancelled
    projects.sort((a, b) => {
        const rA = statusRank(a.status);
        const rB = statusRank(b.status);
        if (rA !== rB) return rA - rB;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    const managers = u.role === 'admin' ? await db.prepare("SELECT id, name, designation FROM users WHERE role='manager' AND active=1 AND (organization_id=? OR id IN (SELECT user_id FROM user_organizations WHERE organization_id=?)) ORDER BY name").all(orgId, orgId) : [];
    res.render('projects', {
        projects,
        managers,
        error: req.query.error || ''
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
    const orgId = req.session.user.organization_id || 1;

    if (id) {
        if (req.session.user.role !== 'admin') {
            return res.status(403).render('error', { message: 'Access denied. Only Admin can edit project details.' });
        }
        const existing = await db.prepare('SELECT * FROM projects WHERE id=? AND organization_id=?').get(id, orgId);
        if (!existing) return res.status(404).render('error', { message: 'Project not found' });

        if (!name) {
            return res.status(400).render('error', { message: 'Project name is required' });
        }

        const managerIds = String(existing.manager_id || '').split(',').map(x => Number(x.trim())).filter(Boolean);

        await db.prepare('UPDATE projects SET name=?,description=?,start_date=?,end_date=? WHERE id=? AND organization_id=?').run(
            name, description, start_date || null, end_date || null, id, orgId
        );

        await activity.log(req.session.user.id, 'Project Updated', name);
        for (const mId of managerIds) {
            await notifications.notify(mId, `Project Updated: ${req.session.user.name} updated details for '${name}'`, `/projects/${id}`);
        }
        return res.redirect(`/projects/${id}`);
    }

    const rawInput = req.body.manager_id || req.body.assigned_to;
    let rawManagerIds = [];
    if (Array.isArray(rawInput)) {
        rawManagerIds = rawInput;
    } else if (rawInput) {
        rawManagerIds = [rawInput];
    }

    const managerIds = [...new Set(rawManagerIds.map(x => Number(x)).filter(Boolean))];
    if (!name || !managerIds.length) {
        return res.redirect('/projects?error=' + encodeURIComponent('Please select at least one manager before assigning the project.'));
    }

    const managerIdStr = managerIds.join(',');
    const statusRow = await db.prepare('SELECT id FROM statuses WHERE normalized_name=?').get('planned');
    const statusId = (statusRow && statusRow.id !== undefined) ? statusRow.id : 4;
    const result = await db.prepare('INSERT INTO projects(name,description,start_date,end_date,created_by,manager_id,status,status_id,organization_id) VALUES(?,?,?,?,?,?,?,?,?)').run(
        name, description, start_date || null, end_date || null, req.session.user.id, managerIdStr, statusId, statusId, orgId
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
};

exports.detail = async (req, res) => {
    const u = req.session.user;
    const orgId = u.organization_id || 1;
    const project = await db.prepare("SELECT p.*, c.name creator_name FROM projects p JOIN users c ON c.id=p.created_by WHERE p.id=? AND p.organization_id=?").get(req.params.id, orgId);

    if (!project) return res.status(404).render('error', { message: 'Project not found' });
    project.status = resolveStatusName(project.status, project.status_id);

    const managerIds = String(project.manager_id || '').split(',').map(x => Number(x.trim())).filter(Boolean);
    const isAssignedManager = managerIds.includes(u.id);

    if (u.role !== 'admin' && !isAssignedManager) {
        return res.status(403).render('error', { message: 'Access denied' });
    }

    const allManagers = await db.prepare("SELECT id, name FROM users WHERE (organization_id=? OR id IN (SELECT user_id FROM user_organizations WHERE organization_id=?))").all(orgId, orgId);
    const managerMap = new Map(allManagers.map(m => [m.id, m.name]));
    project.manager_name = managerIds.map(id => managerMap.get(id) || `Manager #${id}`).join(', ');

    const projectAssignees = await db.prepare('SELECT pa.*, u.name, u.email FROM project_assignees pa JOIN users u ON u.id=pa.user_id WHERE pa.project_id=?').all(project.id);

    const tasks = await db.prepare("SELECT t.*, u.name employee_name FROM tasks t JOIN users u ON u.id=t.assigned_to WHERE t.project_id=? AND t.organization_id=? ORDER BY t.created_at DESC").all(project.id, orgId);
    tasks.sort((a, b) => {
        const rA = statusRank(a.status);
        const rB = statusRank(b.status);
        if (rA !== rB) return rA - rB;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    const updates = await db.prepare('SELECT x.*, u.name manager_name FROM project_updates x JOIN users u ON u.id=x.manager_id WHERE x.project_id=? ORDER BY x.created_at DESC').all(project.id);
    const managers = u.role === 'admin' ? await db.prepare("SELECT id, name FROM users WHERE role='manager' AND active=1 AND (organization_id=? OR id IN (SELECT user_id FROM user_organizations WHERE organization_id=?)) ORDER BY name").all(orgId, orgId) : [];

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
  try {
    const u = req.session.user;
    const orgId = u.organization_id || 1;
    const project = await db.prepare('SELECT * FROM projects WHERE id=? AND organization_id=?').get(req.params.id, orgId);

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
    const statusToId = { 'Pending': 0, 'In Progress': 1, 'Completed': 2, 'Cancelled': 3, 'Planned': 4 };
    const newStatusId = statusToId[newStatus] ?? 1;

    if (managerIds.length > 1) {
        try {
            await db.prepare('INSERT INTO project_assignees(project_id, user_id, status, status_id) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE status=?, status_id=?, completed_at=CASE WHEN ?=2 THEN NOW() ELSE NULL END').run(
                project.id, u.id, newStatusId, newStatusId, newStatusId, newStatusId, newStatusId
            );
        } catch(e) { console.error('project_assignees upsert error:', e.message); }

        const stats = await db.prepare('SELECT COUNT(*) total, SUM(CASE WHEN status_id=2 OR status=2 THEN 1 ELSE 0 END) completed FROM project_assignees WHERE project_id=?').get(project.id);
        const allCompleted = stats && Number(stats.total) > 0 && Number(stats.total) === Number(stats.completed);

        const overallStatusId = allCompleted ? 2 : 1;
        await db.prepare("UPDATE projects SET status=?, status_id=?, updated_by=?, started_at=CASE WHEN started_at IS NULL THEN NOW() ELSE started_at END, completed_at=CASE WHEN ?=2 THEN NOW() ELSE NULL END WHERE id=?").run(
            overallStatusId, overallStatusId, u.id, overallStatusId, project.id
        );
    } else {
        await db.prepare("UPDATE projects SET status=?, status_id=?, updated_by=?, started_at=CASE WHEN ?=1 AND started_at IS NULL THEN NOW() ELSE started_at END, completed_at=CASE WHEN ?=2 THEN NOW() ELSE NULL END WHERE id=?").run(
            newStatusId, newStatusId, u.id, newStatusId, newStatusId, project.id
        );
    }

    try { await activity.log(u.id, 'Project Daily Update', project.name); } catch(e) {}
    try { await notifications.notify(project.created_by, `${u.name} added an update to ${project.name}`, `/projects/${project.id}`); } catch(e) {}

    res.redirect(`/projects/${project.id}?success=update`);
  } catch(err) {
    console.error('addUpdate error:', err);
    res.status(500).render('error', { message: 'Failed to send update: ' + err.message });
  }
};