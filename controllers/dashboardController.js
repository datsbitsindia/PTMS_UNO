const {db}=require('../database/init');
exports.index = async (req, res) => {
    const u = req.session.user;
    if (u.role === 'employee') return res.redirect('/tasks');
    
    let taskWhere = '';
    let taskParams = [];

    if (u.role === 'employee') {
        taskWhere = 'WHERE (t.assigned_to=? OR t.id IN (SELECT task_id FROM task_forward_logs WHERE from_user_id=? OR to_user_id=?))';
        taskParams = [u.id, u.id, u.id];
    } else if (u.role === 'manager') {
        taskWhere = 'WHERE (p.manager_id=? OR t.created_by=? OR t.assigned_to=? OR t.id IN (SELECT task_id FROM task_forward_logs WHERE from_user_id=? OR to_user_id=?))';
        taskParams = [u.id, u.id, u.id, u.id, u.id];
    }

    const tasks = await db.prepare(`SELECT t.*, p.name project_name, c.name creator_name, CASE WHEN t.due_date < CURDATE() AND t.status NOT IN ('Completed','Cancelled') THEN 1 ELSE 0 END is_overdue FROM tasks t LEFT JOIN projects p ON p.id=t.project_id LEFT JOIN users c ON c.id=t.created_by ${taskWhere} ORDER BY CASE LOWER(t.status) WHEN 'planned' THEN 1 WHEN 'pending' THEN 2 WHEN 'in progress' THEN 3 WHEN 'completed' THEN 4 WHEN 'cancelled' THEN 5 ELSE 6 END, t.created_at DESC`).all(...taskParams);
    
    const today = new Date().toISOString().slice(0, 10);
    const projOrder = "ORDER BY CASE LOWER(p.status) WHEN 'planned' THEN 1 WHEN 'pending' THEN 2 WHEN 'in progress' THEN 3 WHEN 'completed' THEN 4 WHEN 'cancelled' THEN 5 ELSE 6 END, p.created_at DESC";
    const projects = u.role === 'admin' ? await db.prepare(`SELECT p.*,m.name manager_name,(SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) task_count,CASE WHEN p.end_date<CURDATE() AND p.status NOT IN ('Completed','Cancelled') THEN 1 ELSE 0 END is_overdue FROM projects p JOIN users m ON m.id=p.manager_id ${projOrder}`).all() : u.role === 'manager' ? await db.prepare(`SELECT p.*,m.name manager_name,(SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) task_count,CASE WHEN p.end_date<CURDATE() AND p.status NOT IN ('Completed','Cancelled') THEN 1 ELSE 0 END is_overdue FROM projects p JOIN users m ON m.id=p.manager_id WHERE p.manager_id=? ${projOrder}`).all(u.id) : [];
    const employees = u.role !== 'employee' ? (await db.prepare("SELECT COUNT(*) count FROM users WHERE role='employee' AND active=1").get()).count : null;
    
    const stats = {
        totalProjects: projects.length,
        pendingProjects: projects.filter(p => p.status !== 'Completed' && p.status !== 'Cancelled').length,
        total: tasks.length,
        pending: tasks.filter(t => String(t.status).toLowerCase() === 'pending' || String(t.status).toLowerCase() === 'planned').length,
        inProgress: tasks.filter(t => String(t.status).toLowerCase() === 'in progress').length,
        completed: tasks.filter(t => String(t.status).toLowerCase() === 'completed').length,
        overdue: tasks.filter(t => t.is_overdue || (t.due_date && new Date(t.due_date) < new Date(today) && !['Completed','Cancelled'].includes(t.status))).length,
        high: tasks.filter(t => ['High','Critical'].includes(t.priority)).length
    };
    
    res.render('dashboard', { stats, employees, projects, tasks: tasks.slice(0, 10) });
};
