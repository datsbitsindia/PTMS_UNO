const {
    db
} = require('../database/init');
const activity = require('../services/activityService');
const notifications = require('../services/notificationService');
exports.list = async (req, res) => {
    const u = req.session.user;
    const statusOrderSql = "ORDER BY CASE LOWER(p.status) WHEN 'planned' THEN 1 WHEN 'pending' THEN 2 WHEN 'in progress' THEN 3 WHEN 'completed' THEN 4 WHEN 'cancelled' THEN 5 ELSE 6 END, p.created_at DESC";
    
    let whereConditions = u.role === 'admin' ? [] : ['p.manager_id=?'];
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
    const projects = await db.prepare(`SELECT p.*,m.name manager_name,(SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) task_count,CASE WHEN p.end_date<CURDATE() AND p.status NOT IN ('Completed','Cancelled') THEN 1 ELSE 0 END is_overdue FROM projects p JOIN users m ON m.id=p.manager_id ${whereClause} ${statusOrderSql}`).all(...params);
    const managers = u.role === 'admin' ? await db.prepare("SELECT id,name FROM users WHERE role='manager' AND active=1 ORDER BY name").all() : [];
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
        end_date,
        manager_id
    } = req.body;
    if (!name || !manager_id) return res.status(400).render('error', {
        message: 'Project name and manager are required'
    });
    const manager = await db.prepare("SELECT id FROM users WHERE id=? AND role='manager' AND active=1").get(manager_id);
    if (!manager) return res.status(400).render('error', {
        message: 'Please select a valid manager'
    });

    if (id) {
        const existing = await db.prepare('SELECT * FROM projects WHERE id=?').get(id);
        if (!existing) return res.status(404).render('error', { message: 'Project not found' });

        await db.prepare('UPDATE projects SET name=?,description=?,start_date=?,end_date=?,manager_id=? WHERE id=?').run(
            name, description, start_date || null, end_date || null, manager_id, id
        );
        await activity.log(req.session.user.id, 'Project Updated', name);
        await notifications.notify(manager_id, `Project Updated: ${req.session.user.name} has updated project details for '${name}'`, `/projects/${id}`);
        if (existing.manager_id !== Number(manager_id)) {
            await notifications.notify(existing.manager_id, `Project Re-assigned: Project '${name}' has been re-assigned to another manager.`, `/projects`);
        }
        res.redirect(`/projects/${id}`);
    } else {
        const result = await db.prepare('INSERT INTO projects(name,description,start_date,end_date,created_by,manager_id) VALUES(?,?,?,?,?,?)').run(name, description, start_date || null, end_date || null, req.session.user.id, manager_id);
        await activity.log(req.session.user.id, 'Project Assigned', name);
        await notifications.notify(manager_id, `New project assigned: ${name}`, `/projects/${result.lastInsertRowid}`);
        res.redirect('/projects');
    }
};
exports.detail = async (req, res) => {
    const u = req.session.user;
    const project = await db.prepare('SELECT p.*,m.name manager_name,c.name creator_name FROM projects p JOIN users m ON m.id=p.manager_id JOIN users c ON c.id=p.created_by WHERE p.id=?').get(req.params.id);
    if (!project || (u.role === 'manager' && project.manager_id !== u.id) || u.role === 'employee') return res.status(404).render('error', {
        message: 'Project not found'
    });
    const tasks = await db.prepare("SELECT t.*,u.name employee_name FROM tasks t JOIN users u ON u.id=t.assigned_to WHERE t.project_id=? ORDER BY CASE LOWER(t.status) WHEN 'planned' THEN 1 WHEN 'pending' THEN 2 WHEN 'in progress' THEN 3 WHEN 'completed' THEN 4 WHEN 'cancelled' THEN 5 ELSE 6 END, t.created_at DESC").all(project.id);
    const updates = await db.prepare('SELECT x.*,u.name manager_name FROM project_updates x JOIN users u ON u.id=x.manager_id WHERE x.project_id=? ORDER BY x.created_at DESC').all(project.id);
    const managers = u.role === 'admin' ? await db.prepare("SELECT id,name FROM users WHERE role='manager' AND active=1 ORDER BY name").all() : [];
    res.render('project-detail', {
        project,
        tasks,
        updates,
        managers,
        success: req.query.success || ''
    });
};
exports.addUpdate = async (req, res) => {
    const project = await db.prepare('SELECT * FROM projects WHERE id=? AND manager_id=?').get(req.params.id, req.session.user.id);
    const message = String(req.body.message || '').trim();
    const progress = Math.max(0, Math.min(100, Number(req.body.progress_percent) || 0));
    if (!project || !message) return res.status(400).render('error', {
        message: 'Project update details are required'
    });
    await db.prepare('INSERT INTO project_updates(project_id,manager_id,message,progress_percent) VALUES(?,?,?,?)').run(project.id, req.session.user.id, message, progress);
    const status = progress >= 100 ? 'Completed' : progress > 0 ? 'In Progress' : 'Planned';
    await db.prepare("UPDATE projects SET status=?,started_at=CASE WHEN ?='In Progress' AND started_at IS NULL THEN NOW() ELSE started_at END,completed_at=CASE WHEN ?='Completed' THEN NOW() ELSE NULL END WHERE id=?").run(status, status, status, project.id);
    await activity.log(req.session.user.id, 'Project Daily Update', project.name);
    await notifications.notify(project.created_by, `${req.session.user.name} added an update to ${project.name}`, `/projects/${project.id}`);
    res.redirect(`/projects/${project.id}?success=update`);
};