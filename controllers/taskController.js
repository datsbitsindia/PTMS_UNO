const path = require('path');
const {
    db
} = require('../database/init');
const activity = require('../services/activityService');
const notifications = require('../services/notificationService');
const routineService = require('../services/routineService');
const config = require('../config');
const query = `SELECT t.*,a.name assigned_name,c.name creator_name,p.name project_name,p.manager_id,CASE WHEN t.due_date<CURDATE() AND t.status NOT IN ('Completed','Cancelled') THEN 1 ELSE 0 END is_overdue FROM tasks t JOIN users a ON a.id=t.assigned_to JOIN users c ON c.id=t.created_by LEFT JOIN projects p ON p.id=t.project_id`;
const canView = async (u, t) => {
    if (u.role === 'admin') return true;
    if (t.assigned_to === u.id || t.created_by === u.id) return true;
    if (u.role === 'manager' && t.manager_id === u.id) return true;
    const forwardLog = await db.prepare('SELECT 1 FROM task_forward_logs WHERE task_id=? AND (from_user_id=? OR to_user_id=?)').get(t.id, u.id, u.id);
    if (forwardLog) return true;
    return false;
};
exports.list = async (req, res) => {
    const u = req.session.user;
    
    // Auto sync daily routine tasks for today
    await routineService.syncDailyRoutines();

    let baseFilter = '1=1';
    let params = [];

    if (u.role === 'employee') {
        baseFilter = '(t.assigned_to=? OR t.created_by=? OR t.id IN (SELECT task_id FROM task_forward_logs WHERE from_user_id=? OR to_user_id=?))';
        params = [u.id, u.id, u.id, u.id];
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
                filters.push("LOWER(t.status) IN ('pending', 'planned')");
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

    const tasks = await db.prepare(query + " WHERE " + filters.join(' AND ') + " ORDER BY CASE LOWER(t.status) WHEN 'planned' THEN 1 WHEN 'pending' THEN 2 WHEN 'in progress' THEN 3 WHEN 'completed' THEN 4 WHEN 'cancelled' THEN 5 ELSE 6 END, t.created_at DESC").all(...params);
    const employees = await db.prepare("SELECT id,name,designation FROM users WHERE role='employee' AND active=1 ORDER BY name").all();
    const managers = [];
    const projects = await db.prepare("SELECT id,name FROM projects WHERE status NOT IN ('Completed','Cancelled') ORDER BY name").all();
    
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
        projects,
        dailyRoutines,
        filters: req.query
    });
};
exports.detail = async (req, res) => {
    const task = await db.prepare(query + ' WHERE t.id=?').get(req.params.id);
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

    res.render('task-detail', {
        task,
        comments,
        attachments,
        employees,
        managers,
        projects,
        forwardLogs,
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

        if (user.role === 'employee' && Number(task.assigned_to) !== Number(user.id)) {
            return res.status(403).render('error', { message: 'You can only forward tasks assigned to you.' });
        }

        const targetUser = await db.prepare("SELECT * FROM users WHERE id=? AND role IN ('employee', 'manager') AND active=1").get(toUserId);
        if (!targetUser) return res.status(400).render('error', { message: 'Selected colleague not found or inactive.' });

        if (Number(targetUser.id) === Number(task.assigned_to)) {
            return res.status(400).render('error', { message: 'Cannot forward task to the same colleague.' });
        }

        const fromUser = await db.prepare("SELECT name FROM users WHERE id=?").get(user.id);
        const noteText = reason || 'Handover';

        await db.prepare('INSERT INTO task_forward_logs(task_id, from_user_id, to_user_id, reason) VALUES(?,?,?,?)')
            .run(taskId, Number(user.id), Number(targetUser.id), noteText);

        await db.prepare('UPDATE tasks SET assigned_to=?, is_forwarded=1, updated_by=? WHERE id=?')
            .run(Number(targetUser.id), Number(user.id), taskId);

        await activity.log(user.id, 'Task Forwarded', `${fromUser?.name || 'User'} -> ${targetUser.name}: ${task.title}`);

        await notifications.notify(
            targetUser.id,
            `Task Forwarded: ${fromUser?.name || 'User'} has forwarded '${task.title}' to you with note: '${noteText}'`,
            `/tasks/${taskId}`
        );

        if (Number(task.created_by) !== Number(user.id)) {
            await notifications.notify(
                task.created_by,
                `Task Activity: ${fromUser?.name || 'User'} forwarded task '${task.title}' to ${targetUser.name}.`,
                `/tasks/${taskId}`
            );
        }

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
        estimated_hours = 0,
        project_id
    } = req.body;
    const pid = project_id ? Number(project_id) : null;
    const targetUser = await db.prepare("SELECT id FROM users WHERE id=? AND role IN ('employee', 'manager') AND active=1").get(assigned_to);
    if (!title || !targetUser) return res.status(400).render('error', {
        message: 'Valid assignee and task title are required'
    });

    if (id) {
        const existingTask = await db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
        if (!existingTask) return res.status(404).render('error', { message: 'Task not found' });

        await db.prepare('UPDATE tasks SET project_id=?,title=?,description=?,priority=?,due_date=?,assigned_to=?,estimated_hours=? WHERE id=?').run(
            pid, title, description, priority, due_date || null, assigned_to, Number(estimated_hours) || 0, id
        );

        await activity.log(req.session.user.id, 'Task Updated', title);
        await notifications.notify(assigned_to, `Task Updated: ${req.session.user.name} updated task details for '${title}'`, `/tasks/${id}`);
        if (existingTask.assigned_to !== Number(assigned_to)) {
            await notifications.notify(existingTask.assigned_to, `Task Re-assigned: Task '${title}' has been re-assigned to another employee.`, `/tasks`);
        }
        res.redirect(`/tasks/${id}`);
    } else {
        const result = await db.prepare('INSERT INTO tasks(project_id,title,description,priority,status,due_date,created_by,assigned_to,estimated_hours) VALUES(?,?,?,?,?,?,?,?,?)').run(pid, title, description, priority, 'Pending', due_date || null, req.session.user.id, assigned_to, Number(estimated_hours) || 0);
        await activity.log(req.session.user.id, 'Task Assigned', title);
        await notifications.notify(assigned_to, `New task assigned: ${title}`, `/tasks/${result.lastInsertRowid}`);
        res.redirect('/tasks');
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
    const employee = await db.prepare("SELECT id FROM users WHERE id=? AND role='employee' AND active=1").get(assigned_to);

    if (!title || !employee || !start_date || !end_date) {
        return res.status(400).render('error', {
            message: 'Employee, title, start date and end date are required for daily routine task.'
        });
    }

    await db.prepare(`
        INSERT INTO daily_routines
        (project_id, created_by, assigned_to, title, description, priority, estimated_hours, start_date, end_date, daily_time, mandatory, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
        pid,
        req.session.user.id,
        assigned_to,
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
    await notifications.notify(assigned_to, `New Daily Routine assigned: ${title} (${start_date} to ${end_date})`, '/tasks');

    // Instantly sync tasks so if today falls in range, today's task is created immediately
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
    const task = await db.prepare(query + ' WHERE t.id=?').get(req.params.id);
    if (!task || (task.assigned_to !== req.session.user.id && req.session.user.role !== 'admin')) return res.status(403).render('error', {
        message: 'Only the assigned user or admin can update this task status'
    });
    if (!['Pending', 'In Progress', 'Completed', 'Cancelled'].includes(req.body.status)) return res.status(400).render('error', {
        message: 'Invalid status'
    });
    await db.prepare('UPDATE tasks SET status=?,completed_at=? WHERE id=?').run(req.body.status, req.body.status === 'Completed' ? new Date() : null, task.id);
    if (task.is_routine) {
        await routineService.updateRoutineLogStatus(task.id, req.body.status);
    }
    await activity.log(req.session.user.id, req.body.status === 'Completed' ? 'Task Completed' : 'Task Updated', task.title);
    await notifications.notify(task.created_by, `${req.session.user.name} changed ${task.title} to ${req.body.status}`, `/tasks/${task.id}`);
    res.redirect(`/tasks/${task.id}?success=status`);
};
exports.comment = async (req, res) => {
    const task = await db.prepare(query + ' WHERE t.id=?').get(req.params.id),
        message = String(req.body.message || '').trim();
    if (!task || !canView(req.session.user, task) || !message) return res.status(403).render('error', {
        message: 'Not allowed'
    });
    await db.prepare('INSERT INTO comments(task_id,user_id,message) VALUES(?,?,?)').run(task.id, req.session.user.id, message);
    await activity.log(req.session.user.id, 'Comment Added', task.title);
    await notifications.notify(req.session.user.id === task.assigned_to ? task.created_by : task.assigned_to, `New comment on: ${task.title}`, `/tasks/${task.id}`);
    res.redirect(`/tasks/${task.id}?success=comment`);
};
exports.upload = async (req, res) => {
    const task = await db.prepare(query + ' WHERE t.id=?').get(req.params.id);
    if (!task || !canView(req.session.user, task) || !req.file) return res.status(400).render('error', {
        message: 'Upload failed'
    });
    await db.prepare('INSERT INTO attachments(task_id,user_id,original_name,stored_name) VALUES(?,?,?,?)').run(task.id, req.session.user.id, req.file.originalname, req.file.filename);
    res.redirect(`/tasks/${task.id}?success=comment`);
};
exports.download = async (req, res) => {
    const file = await db.prepare(query.replace('t.*', 't.id,t.assigned_to,p.manager_id') + ' JOIN attachments x ON x.task_id=t.id WHERE x.id=?').get(req.params.id);
    const attachment = await db.prepare('SELECT * FROM attachments WHERE id=?').get(req.params.id);
    if (!file || !attachment || !canView(req.session.user, file)) return res.status(404).render('error', {
        message: 'File not found'
    });
    res.download(path.join(config.uploadDir, attachment.stored_name), attachment.original_name);
};
exports.duplicate = async (req, res) => res.status(403).render('error', {
    message: 'Duplicate is disabled'
});
exports.remove = async (req, res) => {
    const taskId = req.params.id;
    const task = await db.prepare(query + ' WHERE t.id=?').get(taskId);
    if (!task) return res.status(404).render('error', { message: 'Task not found' });
    
    if (req.session.user.role !== 'admin' && req.session.user.id !== task.created_by && req.session.user.id !== task.manager_id) {
        return res.status(403).render('error', { message: 'Only the task creator or admin can delete this task' });
    }

    // Delete comments & attachments
    await db.prepare('DELETE FROM comments WHERE task_id=?').run(taskId);
    await db.prepare('DELETE FROM attachments WHERE task_id=?').run(taskId);
    
    // Delete task
    await db.prepare('DELETE FROM tasks WHERE id=?').run(taskId);

    // Log activity
    await activity.log(req.session.user.id, 'Task Deleted', task.title);

    // Send notification to assigned employee
    await notifications.notify(
        task.assigned_to,
        `Task Deleted: Manager ${req.session.user.name} has deleted the task "${task.title}".`,
        '/tasks'
    );

    res.redirect('/tasks');
};