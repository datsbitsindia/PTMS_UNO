const { db } = require('../database/init');

exports.list = async (req, res) => {
    const user = req.session.user;
    if (user.role !== 'admin') {
        return res.status(403).render('error', { message: 'Access denied. Admin only.' });
    }

    const {
        date_filter = 'today',
        start_date = '',
        end_date = '',
        project_id = '',
        status = ''
    } = req.query;

    let whereClause = "WHERE a.role IN ('manager', 'employee')";
    let params = [];

    // Date Filter logic
    if (date_filter === 'today') {
        whereClause += " AND (DATE(t.created_at) = CURDATE() OR DATE(t.due_date) = CURDATE())";
    } else if (date_filter === 'yesterday') {
        whereClause += " AND (DATE(t.created_at) = SUBDATE(CURDATE(), INTERVAL 1 DAY) OR DATE(t.due_date) = SUBDATE(CURDATE(), INTERVAL 1 DAY))";
    } else if (date_filter === 'last_week') {
        whereClause += " AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)";
    } else if (date_filter === 'custom' && start_date && end_date) {
        whereClause += " AND (DATE(t.created_at) BETWEEN ? AND ? OR DATE(t.due_date) BETWEEN ? AND ?)";
        params.push(start_date, end_date, start_date, end_date);
    }

    // Project sub-filter
    if (project_id) {
        whereClause += " AND t.project_id = ?";
        params.push(Number(project_id));
    }

    // Status sub-filter
    if (status) {
        const cleanStatus = status.trim().toLowerCase();
        if (cleanStatus === 'overdue') {
            whereClause += " AND t.due_date < CURDATE() AND t.status NOT IN ('Completed', 'Cancelled')";
        } else if (cleanStatus === 'pending') {
            whereClause += " AND LOWER(t.status) IN ('pending', 'planned')";
        } else {
            whereClause += " AND LOWER(t.status) = ?";
            params.push(cleanStatus);
        }
    }

    const sql = `
        SELECT 
            t.*,
            a.name AS assigned_name,
            a.role AS assigned_role,
            a.department AS assigned_dept,
            c.name AS creator_name,
            c.role AS creator_role,
            p.name AS project_name,
            CASE WHEN t.due_date < CURDATE() AND t.status NOT IN ('Completed','Cancelled') THEN 1 ELSE 0 END AS is_overdue
        FROM tasks t
        JOIN users a ON a.id = t.assigned_to
        JOIN users c ON c.id = t.created_by
        LEFT JOIN projects p ON p.id = t.project_id
        ${whereClause}
        ORDER BY t.created_at DESC
    `;

    const tasks = await db.prepare(sql).all(...params);
    const projects = await db.prepare("SELECT id, name FROM projects ORDER BY CASE WHEN name='Self Task' THEN 0 ELSE 1 END, name").all();

    res.render('updates', {
        tasks,
        projects,
        date_filter,
        start_date,
        end_date,
        project_id,
        status
    });
};
