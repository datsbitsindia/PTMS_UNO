const { db } = require('../database/init');
const notifications = require('./notificationService');

async function syncDailyRoutines() {
    try {
        const activeRoutines = await db.prepare(`
            SELECT * FROM daily_routines 
            WHERE active = 1 
              AND CURDATE() >= start_date 
              AND CURDATE() <= end_date
        `).all();

        for (const routine of activeRoutines) {
            const existingTask = await db.prepare(`
                SELECT id FROM tasks 
                WHERE routine_id = ? AND due_date = CURDATE()
                LIMIT 1
            `).get(routine.id);

            if (!existingTask) {
                const res = await db.prepare(`
                    INSERT INTO tasks 
                    (project_id, title, description, priority, priority_id, status, status_id, due_date, created_by, assigned_to, estimated_hours, routine_id, is_routine)
                    VALUES (?, ?, ?, ?, 2, 'Pending', 0, CURDATE(), ?, ?, ?, ?, 1)
                `).run(
                    routine.project_id,
                    routine.title,
                    routine.description || 'Daily Routine Task',
                    routine.priority || 'High',
                    routine.created_by,
                    routine.assigned_to,
                    routine.estimated_hours || 0,
                    routine.id
                );

                const taskId = res.lastInsertRowid;

                // Log execution event in database
                await db.prepare(`
                    INSERT INTO daily_routine_logs
                    (routine_id, task_id, assigned_to, execution_date, status)
                    VALUES (?, ?, ?, CURDATE(), 'Generated')
                `).run(routine.id, taskId, routine.assigned_to);

                await notifications.notifyOnce(
                    routine.assigned_to,
                    `Daily Routine Assigned for Today: ${routine.title}. Please complete this task first.`,
                    `/tasks/${taskId}`,
                    routine.created_by
                );
            }
        }
    } catch (err) {
        console.error('Error syncing daily routines:', err);
    }
}

async function updateRoutineLogStatus(taskId, status) {
    try {
        const logStatus = status === 'Completed' ? 'Completed' : status === 'In Progress' ? 'In Progress' : 'Generated';
        await db.prepare(`
            UPDATE daily_routine_logs 
            SET status = ?, completed_at = ? 
            WHERE task_id = ?
        `).run(logStatus, status === 'Completed' ? new Date() : null, taskId);
    } catch (err) {
        console.error('Error updating routine log status:', err);
    }
}

module.exports = {
    syncDailyRoutines,
    updateRoutineLogStatus
};
