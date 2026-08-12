const { db } = require('../database/init');

async function notify(userId, message, link='', createdBy=null) {
    if (!userId) return;
    const targetIds = String(userId).split(',').map(x => Number(x.trim())).filter(Boolean);
    for (const uid of targetIds) {
        try {
            await db.prepare('INSERT INTO notifications(user_id,message,link,created_by) VALUES(?,?,?,?)').run(uid, message, link, createdBy);
        } catch(e) {
            console.error('Notification insert error:', e);
        }
    }
}

async function notifyOnce(userId, message, link='', createdBy=null) {
    if (!userId) return;
    const targetIds = String(userId).split(',').map(x => Number(x.trim())).filter(Boolean);
    for (const uid of targetIds) {
        try {
            const exists = await db.prepare('SELECT id FROM notifications WHERE user_id=? AND message=? AND link=? LIMIT 1').get(uid, message, link);
            if (!exists) await notify(uid, message, link, createdBy);
        } catch(e) {
            console.error('Notification once error:', e);
        }
    }
}

async function syncOverdue(){
    try {
        const tasks=await db.prepare("SELECT t.id,t.title,t.assigned_to,t.created_by,u.name employee_name FROM tasks t JOIN users u ON u.id=t.assigned_to WHERE t.due_date<CURDATE() AND t.status NOT IN ('Completed','Cancelled','2','3') AND COALESCE(t.status_id, 0) NOT IN (2, 3)").all();
        for(const task of tasks){const link=`/tasks/${task.id}`;await notifyOnce(task.assigned_to,`URGENT: Task overdue - ${task.title}. Please complete it immediately.`,link,task.created_by);await notifyOnce(task.created_by,`Task overdue: ${task.title} assigned to ${task.employee_name}.`,link,task.assigned_to);}
        const projects=await db.prepare("SELECT id,name,manager_id,created_by FROM projects WHERE end_date<CURDATE() AND status NOT IN ('Completed','Cancelled','2','3') AND COALESCE(status_id, 0) NOT IN (2, 3)").all();
        for(const project of projects){const link=`/projects/${project.id}`;await notifyOnce(project.manager_id,`URGENT: Project overdue - ${project.name}. Please send an update to admin.`,link,project.created_by);await notifyOnce(project.created_by,`Project overdue: ${project.name}. Manager action is required.`,link,project.manager_id);}
    } catch(e) { console.error('syncOverdue error:', e); }
}
module.exports = { notify,notifyOnce,syncOverdue };

