const { init, db } = require('../database/init');
const config = require('../config');

async function clearAllTasks() {
    try {
        console.log('Initializing database connection...');
        await init();

        console.log('Deleting all task records from PTMS_UNO database...');
        
        await db.prepare('DELETE FROM task_assignees').run();
        await db.prepare('DELETE FROM task_forward_logs').run();
        await db.prepare('DELETE FROM comments').run();
        await db.prepare('DELETE FROM attachments').run();
        await db.prepare('DELETE FROM tasks').run();
        await db.prepare('DELETE FROM daily_routine_logs').run();

        console.log('✅ All tasks and task-related logs successfully cleared! Projects and users are untouched.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error clearing tasks:', err);
        process.exit(1);
    }
}

clearAllTasks();
