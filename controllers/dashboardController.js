const {db}=require('../database/init');

const resolveStatusName = (statusVal, statusIdVal) => {
    if (statusVal !== null && statusVal !== undefined) {
        const strVal = String(statusVal).trim().toLowerCase();
        if (strVal === '0' || strVal === 'pending') return 'Pending';
        if (strVal === '1' || strVal === 'in progress') return 'In Progress';
        if (strVal === '2' || strVal === 'completed') return 'Completed';
        if (strVal === '3' || strVal === 'cancelled') return 'Cancelled';
        if (strVal === '4' || strVal === 'planned') return 'Planned';
    }
    if (statusIdVal !== null && statusIdVal !== undefined) {
        const strId = String(statusIdVal).trim();
        if (strId === '0') return 'Pending';
        if (strId === '1') return 'In Progress';
        if (strId === '2') return 'Completed';
        if (strId === '3') return 'Cancelled';
        if (strId === '4') return 'Planned';
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

    const tasks = await db.prepare(`SELECT t.*, p.name project_name, c.name creator_name, CASE WHEN t.due_date < CURDATE() AND t.status NOT IN ('Completed','Cancelled','2','3') THEN 1 ELSE 0 END is_overdue FROM tasks t LEFT JOIN projects p ON p.id=t.project_id LEFT JOIN users c ON c.id=t.created_by ${taskWhere} ORDER BY t.created_at DESC`).all(...taskParams);
    
    const today = new Date().toISOString().slice(0, 10);
    const rawProjects = u.role === 'admin'
        ? await db.prepare(`SELECT p.*,m.name manager_name,(SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) task_count,CASE WHEN p.end_date<CURDATE() AND p.status NOT IN (2,3) AND p.status NOT IN ('Completed','Cancelled') THEN 1 ELSE 0 END is_overdue FROM projects p JOIN users m ON m.id=p.manager_id ORDER BY p.created_at DESC`).all()
        : u.role === 'manager'
        ? await db.prepare(`SELECT p.*,m.name manager_name,(SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) task_count,CASE WHEN p.end_date<CURDATE() AND p.status NOT IN (2,3) AND p.status NOT IN ('Completed','Cancelled') THEN 1 ELSE 0 END is_overdue FROM projects p JOIN users m ON m.id=p.manager_id WHERE FIND_IN_SET(?, p.manager_id) > 0 ORDER BY p.created_at DESC`).all(u.id)
        : [];

    // Resolve status from numeric ID to human-readable name
    const projects = rawProjects.map(p => ({
        ...p,
        status: resolveStatusName(p.status, p.status_id)
    }));

    projects.sort((a, b) => {
        const rA = statusRank(a.status);
        const rB = statusRank(b.status);
        if (rA !== rB) return rA - rB;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    tasks.sort((a, b) => {
        const rA = statusRank(a.status || a.user_status);
        const rB = statusRank(b.status || b.user_status);
        if (rA !== rB) return rA - rB;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    const employees = u.role !== 'employee' ? (await db.prepare("SELECT COUNT(*) count FROM users WHERE role='employee' AND active=1").get()).count : null;
    
    const stats = {
        totalProjects: projects.length,
        pendingProjects: projects.filter(p => p.status !== 'Completed' && p.status !== 'Cancelled').length,
        total: tasks.length,
        pending: tasks.filter(t => String(t.status).toLowerCase() === 'pending' || String(t.status).toLowerCase() === 'planned').length,
        inProgress: tasks.filter(t => String(t.status).toLowerCase() === 'in progress').length,
        completed: tasks.filter(t => String(t.status).toLowerCase() === 'completed').length,
        overdue: tasks.filter(t => t.is_overdue).length,
        high: tasks.filter(t => ['High','Critical'].includes(t.priority)).length
    };
    
    res.render('dashboard', { stats, employees, projects, tasks: tasks.slice(0, 10) });
};
