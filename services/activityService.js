const { db } = require('../database/init');
async function log(userId, action, detail='') { await db.prepare('INSERT INTO activity_logs(user_id,action,detail) VALUES(?,?,?)').run(userId || null, action, detail); }
module.exports = { log };
