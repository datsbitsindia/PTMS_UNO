const path = require('path');
const {
    db
} = require('../database/init');
const activity = require('../services/activityService');
const notifications = require('../services/notificationService');
const routineService = require('../services/routineService');
const config = require('../config');

const baseQuery = `
    SELECT t.*,
        COALESCE(ta.status, t.status) AS status,
        COALESCE(ta.status, t.status) AS user_status,
        COALESCE(ta.completed_at, t.completed_at) AS completed_at,
        COALESCE(
            (SELECT GROUP_CONCAT(u.name SEPARATOR ', ') FROM task_assignees ta2 JOIN users u ON u.id=ta2.user_id WHERE ta2.task_id=t.id),
            (SELECT GROUP_CONCAT(u.name SEPARATOR ', ') FROM users u WHERE FIND_IN_SET(u.id, t.assigned_to) > 0),
            a.name
        ) AS assigned_name,
        c.name creator_name, p.name project_name, p.manager_id,
        CASE WHEN t.due_date<CURDATE() AND COALESCE(ta.status, t.status) NOT IN ('Completed','Cancelled') THEN 1 ELSE 0 END is_overdue
    FROM tasks t
    LEFT JOIN task_assignees ta ON ta.task_id=t.id AND ta.user_id=?
    LEFT JOIN users a ON a.id=t.assigned_to
    JOIN users c ON c.id=t.created_by
    LEFT JOIN projects p ON p.id=t.project_id
`;

const canView = async (u, t) => {
    if (u.role === 'admin') return true;
    if (t.created_by === u.id) return true;
    if (u.role === 'manager' && t.manager_id === u.id) return true;
    const assignedArr = String(t.assigned_to || '').split(',');
    if (assignedArr.includes(String(u.id))) return true;
    const isAssignee = await db.prepare('SELECT 1 FROM task_assignees WHERE task_id=? AND user_id=?').get(t.id, u.id);
    if (isAssignee) return true;
    const forwardLog = await db.prepare('SELECT 1 FROM task_forward_logs WHERE task_id=? AND (from_user_id=? OR to_user_id=?)').get(t.id, u.id, u.id);
    if (forwardLog) return true;
    return false;
};

exports.list = async (req, res) => {
    const u = req.session.user;
    if (u.role === 'admin') return res.redirect('/projects');
    
    // Auto sync daily routine tasks for today
    await routineService.syncDailyRoutines();

    let baseFilter = '1=1';
    let params = [u.id];

    if (u.role === 'employee') {
        baseFilter = '(FIND_IN_SET(?, t.assigned_to) > 0 OR t.id IN (SELECT task_id FROM task_assignees WHERE user_id=?) OR t.id IN (SELECT task_id FROM task_forward_logs WHERE from_user_id=? OR to_user_id=?))';
        params.push(u.id, u.id, u.id, u.id);
    } else if (u.role === 'manager') {
        baseFilter = '(p.manager_id=? OR t.created_by=? OR FIND_IN_SET(?, t.assigned_to) > 0 OR t.id IN (SELECT task_id FROM task_assignees WHERE user_id=?) OR t.id IN (SELECT task_id FROM task_forward_logs WHERE from_user_id=? OR to_user_id=?))';
        params.push(u.id, u.id, u.id, u.id, u.id, u.id);
    }

    const filters = [baseFilter];

    if (req.query.forwarded === '1') {
        filters.push('t.is_forwarded=1');
    }

    for (const [field, key] of [
        ['status', 'status'],
        ['priority', 'priority'],
        ['assigned_to', 'employee']
    ]) {
        if (req.query[key]) {
            const val = req.query[key].trim();
            if (field === 'status' && val.toLowerCase() === 'pending') {
                filters.push("LOWER(COALESCE(ta.status, t.status)) IN ('pending', 'planned')");
            } else if (field === 'assigned_to') {
                filters.push("FIND_IN_SET(?, t.assigned_to) > 0");
                params.push(val.toLowerCase());
            } else {
                filters.push(`LOWER(t.${field})=?`);
                params.push(val.toLowerCase());
            }
        }
    }

    if (req.query.q) {
        filters.push('(t.title LIKE ? OR t.description LIKE ?)');
        params.push(`%${req.query.q}%`, `%${req.query.q}%`);
    }

    const tasks = await db.prepare(baseQuery + " WHERE " + filters.join(' AND ') + " ORDER BY CASE LOWER(COALESCE(ta.status, t.status)) WHEN 'planned' THEN 1 WHEN 'pending' THEN 2 WHEN 'in progress' THEN 3 WHEN 'completed' THEN 4 WHEN 'cancelled' THEN 5 ELSE 6 END, t.created_at DESC").all(...params);
    const employees = u.role === 'manager' ? await db.prepare("SELECT id,name,designation FROM users WHERE role='employee' AND active=1 ORDER BY name").all() : [];
    const managers = u.role === 'manager' || u.role === 'admin' ? await db.prepare("SELECT id,name,designation FROM users WHERE role='manager' AND active=1 ORDER BY name").all() : [];
    const reportingUsers = await db.prepare("SELECT id,name,role,designation FROM users WHERE role IN ('manager','admin') AND active=1 ORDER BY role, name").all();
    const projects = await db.prepare("SELECT id,name FROM projects WHERE status NOT IN ('Completed','Cancelled') OR name='Self Task' ORDER BY CASE WHEN name='Self Task' THEN 0 ELSE 1 END, name").all();
    
    let dailyRoutines = [];
    if (u.role === 'manager') {
        dailyRoutines = await db.prepare(`
            SELECT r.*, p.name project_name, u.name assigned_name 
            FROM daily_routines r 
            JOIN projects p ON p.id=r.project_id 
            JOIN users u ON u.id=r.assigned_to 
            WHERE r.created_by=? 
            ORDER BY r.created_at DESC
        `).all(u.id);
    }

    res.render('tasks', {
        tasks,
        employees,
        managers,
        reportingUsers,
        projects,
        dailyRoutines,
        filters: req.query
    });
};

exports.detail = async (req, res) => {
    const task = await db.prepare(baseQuery + ' WHERE t.id=?').get(req.session.user.id, req.params.id);
    if (!task || !(await canView(req.session.user, task))) return res.status(404).render('error', {
        message: 'Task not found'
    });
    const comments = await db.prepare('SELECT c.*,u.name FROM comments c JOIN users u ON u.id=c.user_id WHERE task_id=? ORDER BY c.created_at').all(task.id);
    const attachments = await db.prepare('SELECT * FROM attachments WHERE task_id=? ORDER BY created_at DESC').all(task.id);
    const employees = await db.prepare("SELECT id,name,designation FROM users WHERE role='employee' AND active=1 ORDER BY name").all();
    const managers = await db.prepare("SELECT id,name,designation FROM users WHERE role='manager' AND active=1 ORDER BY name").all();
    const projects = req.session.user.role === 'admin' ? await db.prepare("SELECT id,name FROM projects ORDER BY name").all() : await db.prepare("SELECT id,name FROM projects WHERE manager_id=? ORDER BY name").all(req.session.user.id);
    const forwardLogs = await db.prepare(`
        SELECT f.*, ufrom.name as from_name, uto.name as to_name
        FROM task_forward_logs f
        JOIN users ufrom ON ufrom.id = f.from_user_id
        JOIN users uto ON uto.id = f.to_user_id
        WHERE f.task_id = ?
        ORDER BY f.created_at ASC
    `).all(task.id);

    const taskAssignees = await db.prepare(`
        SELECT ta.*, u.name, u.role, u.designation
        FROM task_assignees ta
        JOIN users u ON u.id=ta.user_id
        WHERE ta.task_id=?
    `).all(task.id);

    res.render('task-detail', {
        task,
        comments,
        attachments,
        employees,
        managers,
        projects,
        forwardLogs,
        taskAssignees,
        success: req.query.success || ''
    });
};

exports.forward = async (req, res) => {
    try {
        const taskId = Number(req.params.id);
        const toUserId = Number(req.body.to_user_id);
        const reason = String(req.body.reason || '').trim();
        const user = req.session.user;

        if (!taskId || !toUserId) {
            return res.status(400).render('error', { message: 'Invalid task or target colleague selected.' });
        }

        const task = await db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId);
        if (!task) return res.status(404).render('error', { message: 'Task not found' });

        if (user.role === 'admin') {
            return res.status(403).render('error', { message: 'Admin can only view tasks. Forwarding is disabled in Updates.' });
        }

        const targetUser = await db.prepare("SELECT * FROM users WHERE id=? AND role IN ('employee', 'manager') AND active=1").get(toUserId);
        if (!targetUser) return res.status(400).render('error', { message: 'Selected colleague not found or inactive.' });

        const fromUser = await db.prepare("SELECT name FROM users WHERE id=?").get(user.id);
        const noteText = reason || 'Handover';

        await db.prepare('INSERT INTO task_forward_logs(task_id, from_user_id, to_user_id, reason) VALUES(?,?,?,?)')
            .run(taskId, Number(user.id), Number(targetUser.id), noteText);

        await db.prepare('INSERT IGNORE INTO task_assignees(task_id, user_id, status) VALUES(?,?,?)')
            .run(taskId, Number(targetUser.id), 'Pending');

        const currentAssignees = String(task.assigned_to || '').split(',').filter(Boolean);
        if (!currentAssignees.includes(String(targetUser.id))) {
            currentAssignees.push(String(targetUser.id));
        }
        const updatedAssignedToStr = currentAssignees.join(',');

        await db.prepare('UPDATE tasks SET assigned_to=?, is_forwarded=1, updated_by=? WHERE id=?')
            .run(updatedAssignedToStr, Number(user.id), taskId);

        await activity.log(user.id, 'Task Forwarded', `${fromUser?.name || 'User'} -> ${targetUser.name}: ${task.title}`);

        await notifications.notify(
            targetUser.id,
            `Task Forwarded: ${fromUser?.name || 'User'} has forwarded '${task.title}' to you with note: '${noteText}'`,
            `/tasks/${taskId}`
        );

        res.redirect(`/tasks/${taskId}?success=forwarded`);
    } catch (err) {
        console.error('Task forward error:', err);
        res.status(500).render('error', { message: 'Failed to forward task: ' + err.message });
    }
};

exports.save = async (req, res) => {
    const {
        id,
        title,
        description = '',
        priority = 'Medium',
        due_date,
        assigned_to,
        report_to,
        estimated_hours = 0,
        project_id
    } = req.body;

    let pid = project_id ? Number(project_id) : null;
    if (!pid) {
        const selfTaskProj = await db.prepare("SELECT id FROM projects WHERE name='Self Task' LIMIT 1").get();
        if (selfTaskProj) pid = selfTaskProj.id;
    }

    if (id) {
        let rawAssignees = [];
        if (Array.isArray(assigned_to)) rawAssignees = assigned_to;
        else if (assigned_to) rawAssignees = String(assigned_to).split(',');
        else rawAssignees = [req.session.user.id];

        const assignees = [...new Set(rawAssignees.map(x => Number(x)).filter(Boolean))];
        const assignedToStr = assignees.join(',');

        if (req.session.user.role === 'admin') {
            return res.status(403).render('error', { message: 'Admin can only view tasks. Task editing is disabled in Updates.' });
        }

        const existingTask = await db.prepare('SELECT t.*, p.manager_id FROM tasks t LEFT JOIN projects p ON p.id=t.project_id WHERE t.id=?').get(id);
        if (!existingTask) return res.status(404).render('error', { message: 'Task not found' });

        const isSelfTask = assignees.length === 1 && Number(assignees[0]) === Number(req.session.user.id) ? 1 : 0;
        await db.prepare('UPDATE tasks SET project_id=?,title=?,description=?,priority=?,due_date=?,assigned_to=?,estimated_hours=?,is_self_task=? WHERE id=?').run(
            pid, title, description, priority, due_date || null, assignedToStr, Number(estimated_hours) || 0, isSelfTask, id
        );

        for (const targetAssignee of assignees) {
            await db.prepare('INSERT IGNORE INTO task_assignees(task_id, user_id, status) VALUES(?,?,?)').run(id, targetAssignee, 'Pending');
            await activity.log(req.session.user.id, 'Task Updated', title);
            await notifications.notify(targetAssignee, `Task Updated: ${req.session.user.name} updated task details for '${title}'`, `/tasks/${id}`);
        }
        res.redirect(`/tasks/${id}`);
    } else {
        let rawAssignees = [];
        if (Array.isArray(assigned_to)) {
            rawAssignees = assigned_to;
        } else if (assigned_to) {
            rawAssignees = [assigned_to];
        } else if (req.session.user.role === 'employee') {
            rawAssignees = [req.session.user.id];
        }

        const assignees = [...new Set(rawAssignees.map(x => Number(x)).filter(Boolean))];
        if (!assignees.length) {
            assignees.push(req.session.user.id);
        }

        if (!title) return res.status(400).render('error', { message: 'Task title is required' });

        let createdBy = req.session.user.id;
        if (report_to && Number(report_to)) {
            createdBy = Number(report_to);
        }

        // assigned_to column in tasks table stores all assigned IDs as comma-separated string: "6,7"
        const assignedToStr = assignees.join(',');
        const isSelfTask = assignees.length === 1 && Number(assignees[0]) === Number(req.session.user.id) ? 1 : 0;
        
        // Single Task Entry inserted into tasks table with comma-separated assigned_to e.g. "6,7"
        const result = await db.prepare('INSERT INTO tasks(project_id,title,description,priority,status,due_date,created_by,assigned_to,estimated_hours,is_self_task) VALUES(?,?,?,?,?,?,?,?,?,?)').run(
            pid, title, description, priority, 'Pending', due_date || null, createdBy, assignedToStr, Number(estimated_hours) || 0, isSelfTask
        );
        const taskId = result.lastInsertRowid;

        // Insert into task_assignees table for individual status tracking
        for (const targetAssignee of assignees) {
            await db.prepare('INSERT IGNORE INTO task_assignees(task_id, user_id, status) VALUES(?,?,?)').run(taskId, targetAssignee, 'Pending');
            await activity.log(req.session.user.id, 'Task Created', title);
            if (Number(targetAssignee) !== Number(req.session.user.id)) {
                await notifications.notify(targetAssignee, `New task assigned: ${title}`, `/tasks/${taskId}`);
            }
        }

        res.redirect(`/tasks/${taskId}`);
    }
};

exports.saveRoutine = async (req, res) => {
    const {
        project_id,
        title,
        description = '',
        priority = 'High',
        assigned_to,
        estimated_hours = 0,
        start_date,
        end_date,
        daily_time = '09:00 AM',
        mandatory = 1
    } = req.body;

    const pid = project_id ? Number(project_id) : null;
    let rawAssignees = [];
    if (Array.isArray(assigned_to)) {
        rawAssignees = assigned_to;
    } else if (assigned_to) {
        rawAssignees = [assigned_to];
    }
    const assignees = [...new Set(rawAssignees.map(x => Number(x)).filter(Boolean))];

    if (!title || !assignees.length || !start_date || !end_date) {
        return res.status(400).render('error', {
            message: 'At least one assignee, title, start date and end date are required for daily routine task.'
        });
    }

    for (const assigneeId of assignees) {
        await db.prepare(`
            INSERT INTO daily_routines
            (project_id, created_by, assigned_to, title, description, priority, estimated_hours, start_date, end_date, daily_time, mandatory, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
            pid,
            req.session.user.id,
            assigneeId,
            title,
            description,
            priority,
            Number(estimated_hours) || 0,
            start_date,
            end_date,
            daily_time,
            mandatory ? 1 : 0
        );

        await activity.log(req.session.user.id, 'Daily Routine Created', title);
        await notifications.notify(assigneeId, `New Daily Routine assigned: ${title} (${start_date} to ${end_date})`, '/tasks');
    }

    await routineService.syncDailyRoutines();
    res.redirect('/tasks');
};

exports.toggleRoutine = async (req, res) => {
    const routine = await db.prepare('SELECT * FROM daily_routines WHERE id=? AND created_by=?').get(req.params.id, req.session.user.id);
    if (!routine) return res.status(404).render('error', { message: 'Daily Routine not found' });
    await db.prepare('UPDATE daily_routines SET active=? WHERE id=?').run(routine.active ? 0 : 1, routine.id);
    res.redirect('/tasks');
};

exports.deleteRoutine = async (req, res) => {
    const routine = await db.prepare('SELECT * FROM daily_routines WHERE id=? AND created_by=?').get(req.params.id, req.session.user.id);
    if (!routine) return res.status(404).render('error', { message: 'Daily Routine not found' });
    await db.prepare('DELETE FROM daily_routine_logs WHERE routine_id=?').run(routine.id);
    await db.prepare('DELETE FROM tasks WHERE routine_id=?').run(routine.id);
    await db.prepare('DELETE FROM daily_routines WHERE id=?').run(routine.id);
    res.redirect('/tasks');
};

exports.status = async (req, res) => {
    const task = await db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
    if (!task || !(await canView(req.session.user, task))) return res.status(403).render('error', {
        message: 'Only assigned users or admin can update this task status'
    });
    if (!['Pending', 'In Progress', 'Completed', 'Cancelled'].includes(req.body.status)) return res.status(400).render('error', {
        message: 'Invalid status'
    });

    const newStatus = req.body.status;
    const completedAt = newStatus === 'Completed' ? new Date() : null;

    // Update specific assignee status in junction table
    await db.prepare('INSERT INTO task_assignees(task_id, user_id, status, completed_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE status=?, completed_at=?')
        .run(task.id, req.session.user.id, newStatus, completedAt, newStatus, completedAt);

    // Check overall task completion status
    const remaining = await db.prepare("SELECT COUNT(*) count FROM task_assignees WHERE task_id=? AND status<>'Completed'").get(task.id);
    const overallStatus = (!remaining || remaining.count === 0) ? 'Completed' : 'In Progress';
    await db.prepare('UPDATE tasks SET status=?, completed_at=? WHERE id=?').run(overallStatus, overallStatus === 'Completed' ? new Date() : null, task.id);

    if (task.is_routine) {
        await routineService.updateRoutineLogStatus(task.id, newStatus);
    }
    await activity.log(req.session.user.id, newStatus === 'Completed' ? 'Task Completed' : 'Task Updated', task.title);
    await notifications.notify(task.created_by, `${req.session.user.name} changed status of ${task.title} to ${newStatus}`, `/tasks/${task.id}`);
    res.redirect(`/tasks/${task.id}?success=status`);
};

exports.comment = async (req, res) => {
    const task = await db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
    const message = String(req.body.message || '').trim();
    if (!task || !(await canView(req.session.user, task)) || !message) return res.status(403).render('error', {
        message: 'Not allowed'
    });
    await db.prepare('INSERT INTO comments(task_id,user_id,message) VALUES(?,?,?)').run(task.id, req.session.user.id, message);
    await activity.log(req.session.user.id, 'Comment Added', task.title);
    await notifications.notify(req.session.user.id === task.assigned_to ? task.created_by : task.assigned_to, `New comment on: ${task.title}`, `/tasks/${task.id}`);
    res.redirect(`/tasks/${task.id}?success=comment`);
};

exports.upload = async (req, res) => {
    const task = await db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
    if (!task || !(await canView(req.session.user, task)) || !req.file) return res.status(400).render('error', {
        message: 'Upload failed'
    });
    await db.prepare('INSERT INTO attachments(task_id,user_id,original_name,stored_name) VALUES(?,?,?,?)').run(task.id, req.session.user.id, req.file.originalname, req.file.filename);
    res.redirect(`/tasks/${task.id}?success=comment`);
};

exports.download = async (req, res) => {
    const attachment = await db.prepare('SELECT * FROM attachments WHERE id=?').get(req.params.id);
    if (!attachment) return res.status(404).render('error', { message: 'File not found' });
    const task = await db.prepare('SELECT * FROM tasks WHERE id=?').get(attachment.task_id);
    if (!task || !(await canView(req.session.user, task))) return res.status(404).render('error', {
        message: 'File not found'
    });
    res.download(path.join(config.uploadDir, attachment.stored_name), attachment.original_name);
};

exports.duplicate = async (req, res) => res.status(403).render('error', {
    message: 'Duplicate is disabled'
});

exports.remove = async (req, res) => {
    const taskId = req.params.id;
    const task = await db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId);
    if (!task) return res.status(404).render('error', { message: 'Task not found' });
    
    if (req.session.user.role === 'admin') {
        return res.status(403).render('error', { message: 'Admin can only view tasks. Task deletion is disabled in Updates.' });
    }

    const canDelete = req.session.user.id === task.created_by ||
                      req.session.user.id === task.manager_id ||
                      String(task.assigned_to || '').split(',').includes(String(req.session.user.id));

    if (!canDelete) {
        return res.status(403).render('error', { message: 'Only the task creator, manager, or assigned user can delete this task.' });
    }

    // Delete comments, attachments & assignees
    await db.prepare('DELETE FROM task_assignees WHERE task_id=?').run(taskId);
    await db.prepare('DELETE FROM comments WHERE task_id=?').run(taskId);
    await db.prepare('DELETE FROM attachments WHERE task_id=?').run(taskId);
    await db.prepare('DELETE FROM tasks WHERE id=?').run(taskId);

    await activity.log(req.session.user.id, 'Task Deleted', task.title);

    const assigneesList = String(task.assigned_to || '').split(',').filter(Boolean);
    for (const uid of assigneesList) {
        await notifications.notify(
            uid,
            `Task Deleted: Manager ${req.session.user.name} has deleted the task "${task.title}".`,
            '/tasks'
        );
    }

    res.redirect('/tasks');
};